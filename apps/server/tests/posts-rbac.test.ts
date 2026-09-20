import { beforeEach, describe, expect, test } from "bun:test";
import type { AppContext } from "../context.ts";
import { createApp } from "../http/app.ts";
import { findRoleByKey, grantRolePermissions, revokeRolePermission } from "../modules/rbac/service.ts";
import { resolveDefaultOrganizationId } from "../platform/database/organizations.ts";
import { createTestContext, loginOwner, signUpUser, truncateAll } from "./helpers.ts";

describe("posts RBAC end-to-end", () => {
  let ctxBox: { ctx: AppContext } = {} as { ctx: AppContext };
  let app: ReturnType<typeof createApp>;
  let ownerCookie: string;
  let organizationId: string;

  beforeEach(async () => {
    ctxBox = { ctx: await createTestContext() };
    await truncateAll(ctxBox.ctx);
    const { seed } = await import("../platform/database/seed.ts");
    await seed(ctxBox.ctx.db);
    organizationId = await resolveDefaultOrganizationId(ctxBox.ctx.db);
    app = createApp(ctxBox.ctx, organizationId);
    ownerCookie = await loginOwner(app, ctxBox.ctx.db);
  });

  async function createUserWithRole(email: string, roleKey: string | null): Promise<string> {
    const user = await signUpUser(app, email);
    if (roleKey) {
      const role = await findRoleByKey(ctxBox.ctx.db, organizationId, roleKey);
      if (!role) throw new Error(`role ${roleKey} tidak ada`);
      const { assignRole } = await import("../modules/rbac/service.ts");
      await assignRole(ctxBox.ctx.db, { userId: user.id, roleId: role.id });
    }
    const signIn = await app.request("/api/v1/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "sandi-yang-panjang" }),
    });
    expect(signIn.status).toBe(200);
    return (signIn.headers.get("set-cookie") as string).split(";")[0] as string;
  }

  test("anonim: semua endpoint post 401", async () => {
    expect((await app.request("/api/v1/posts")).status).toBe(401);
    expect(
      (
        await app.request("/api/v1/posts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
  });

  test("owner: CRUD penuh + audit tercatat", async () => {
    const created = await app.request("/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ title: "Post Pertama", slug: "post-pertama", content: "isi" }),
    });
    expect(created.status).toBe(200);
    const { data: post } = (await created.json()) as { data: { id: string; published: boolean } };
    expect(post.published).toBe(false);

    const patched = await app.request(`/api/v1/posts/${post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ published: true }),
    });
    expect(patched.status).toBe(200);

    const listed = await app.request("/api/v1/posts", { headers: { cookie: ownerCookie } });
    const { data: list } = (await listed.json()) as { data: { total: number } };
    expect(list.total).toBe(1);

    const audit = await app.request("/api/v1/audit-logs?event=post.created", { headers: { cookie: ownerCookie } });
    const { data: logs } = (await audit.json()) as { data: { items: { event: string; actorLabel: string }[] } };
    expect(logs.items.length).toBeGreaterThanOrEqual(1);
    expect(logs.items[0]?.actorLabel).toContain("@");

    const removed = await app.request(`/api/v1/posts/${post.id}`, {
      method: "DELETE",
      headers: { cookie: ownerCookie },
    });
    expect(removed.status).toBe(200);
  });

  test("staff (tanpa izin post): semua aksi post 403", async () => {
    const cookie = await createUserWithRole("staff@example.test", "staff");
    const res = await app.request("/api/v1/posts", { headers: { cookie } });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("custom role dengan post.read saja: bisa baca, create 403; grant/remove izin mengubah akses langsung", async () => {
    const cookie = await createUserWithRole("editor@example.test", null);
    expect((await app.request("/api/v1/posts", { headers: { cookie } })).status).toBe(403);

    const owner = await findRoleByKey(ctxBox.ctx.db, organizationId, "owner");
    if (!owner) throw new Error("owner hilang");
    const created = await app.request("/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ title: "Post Editor", slug: "post-editor" }),
    });
    const { data: post } = (await created.json()) as { data: { id: string } };

    const { roles: rolesTable } = await import("../modules/rbac/data.ts");
    const inserted = await ctxBox.ctx.db
      .insert(rolesTable)
      .values({ organizationId, key: "editor", name: "Editor", description: "baca post saja", isSystem: false })
      .returning({ id: rolesTable.id });
    const editorId = inserted[0]?.id as string;
    await grantRolePermissions(ctxBox.ctx.db, editorId, ["post.read"]);
    const { assignRole } = await import("../modules/rbac/service.ts");
    const editorUser = await signUpUser(app, "editor2@example.test");
    await assignRole(ctxBox.ctx.db, { userId: editorUser.id, roleId: editorId });
    const editorCookie = await (async () => {
      const signIn = await app.request("/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "editor2@example.test", password: "sandi-yang-panjang" }),
      });
      return (signIn.headers.get("set-cookie") as string).split(";")[0] as string;
    })();

    const readRes = await app.request("/api/v1/posts", { headers: { cookie: editorCookie } });
    expect(readRes.status).toBe(200);
    expect(
      (await app.request(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: { cookie: editorCookie } })).status,
    ).toBe(403);

    // Revoke post.read dari editor -> akses hilang pada request berikutnya.
    await revokeRolePermission(ctxBox.ctx.db, editorId, "post.read");
    expect((await app.request("/api/v1/posts", { headers: { cookie: editorCookie } })).status).toBe(403);

    // Grant kembali -> akses pulih.
    await grantRolePermissions(ctxBox.ctx.db, editorId, ["post.read"]);
    expect((await app.request("/api/v1/posts", { headers: { cookie: editorCookie } })).status).toBe(200);
  });
});
