import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { rowsOf } from "../../../database/rows.ts";
import { createAuth } from "../../../features/identity/auth.ts";
import { members, organizations } from "../../../features/organizations/schema.ts";
import { createTestContext, testEnv, truncateAll } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx ??= await createTestContext();
  await truncateAll(ctx);
});

afterAll(async () => {
  // The context is shared with every other file; closing it here would break them.
});

/**
 * Signs up through the real Better Auth server API and returns the session cookie as headers for
 * the following `ctx.auth.api` calls. Public sign-up is off by default, so this test builds an auth
 * instance with it enabled — sign-up is not the subject here: the plugin is. The session rows are
 * shared, so the context's own auth instance accepts the cookie.
 */
async function signUp(email: string): Promise<Headers> {
  const auth = createAuth({ ...testEnv, AUTH_SIGNUP_ENABLED: true }, ctx.db);
  const { headers } = await auth.api.signUpEmail({
    body: { email, password: "sandi-yang-panjang", name: email.split("@")[0] ?? "User" },
    returnHeaders: true,
  });
  const cookie = headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("sign-up tidak mengembalikan cookie sesi");
  return new Headers({ cookie });
}

describe("organizations", () => {
  test("the plugin creates an organization with its creator as owner member", async () => {
    const headers = await signUp("pendiri@example.test");

    const organization = await ctx.auth.api.createOrganization({
      body: { name: "PT Contoh", slug: "pt-contoh" },
      headers,
    });
    expect(organization.id).toBeTruthy();
    expect(organization.slug).toBe("pt-contoh");

    const rows = await ctx.db.select().from(organizations).where(eq(organizations.id, organization.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("PT Contoh");

    const memberRows = await ctx.db.select().from(members).where(eq(members.organizationId, organization.id));
    expect(memberRows).toHaveLength(1);
    // The plugin's creatorRole default; a member row without it would leave the org ownerless.
    expect(memberRows[0]?.role).toBe("owner");
  });

  test("listing organizations returns the caller's organizations", async () => {
    const headers = await signUp("anggota@example.test");
    await ctx.auth.api.createOrganization({ body: { name: "Alpha", slug: "alpha" }, headers });
    await ctx.auth.api.createOrganization({ body: { name: "Beta", slug: "beta" }, headers });

    const list = await ctx.auth.api.listOrganizations({ headers });
    expect(list.map((organization) => organization.slug).sort()).toEqual(["alpha", "beta"]);
  });

  test("setting an organization active is reflected on the session", async () => {
    const headers = await signUp("pemilik@example.test");
    const first = await ctx.auth.api.createOrganization({ body: { name: "Pertama", slug: "pertama" }, headers });
    // Creating a second organization makes it active, so the set-active call below changes state.
    await ctx.auth.api.createOrganization({ body: { name: "Kedua", slug: "kedua" }, headers });

    const before = await ctx.auth.api.getSession({ headers });
    expect(before?.session.activeOrganizationId).not.toBe(first.id);

    await ctx.auth.api.setActiveOrganization({ body: { organizationId: first.id }, headers });
    const after = await ctx.auth.api.getSession({ headers });
    expect(after?.session.activeOrganizationId).toBe(first.id);
  });

  test("the same user cannot be a member of one organization twice", async () => {
    const headers = await signUp("ganda@example.test");
    const organization = await ctx.auth.api.createOrganization({ body: { name: "Ganda", slug: "ganda" }, headers });
    const session = await ctx.auth.api.getSession({ headers });
    const userId = session?.user.id as string;

    await expect(
      Promise.resolve(ctx.db.insert(members).values({ organizationId: organization.id, userId })),
    ).rejects.toThrow();
  });

  test("the session's active organization is indexed and foreign-keyed", async () => {
    const headers = await signUp("aktif@example.test");
    const session = await ctx.auth.api.getSession({ headers });
    const userId = session?.user.id as string;

    const indexes = rowsOf<{ indexname: string }>(
      await ctx.db.execute(sql`select indexname from pg_indexes where tablename = 'session'`),
    ).map((row) => row.indexname);
    expect(indexes).toContain("session_active_organization_idx");

    // A dangling active organization would leave the session pointing at nothing after a delete.
    await expect(
      Promise.resolve(
        ctx.db.execute(sql`update "session" set active_organization_id = ${createUuid()} where user_id = ${userId}`),
      ),
    ).rejects.toThrow();
  });
});
