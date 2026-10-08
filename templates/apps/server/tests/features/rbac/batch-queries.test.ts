import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AppContext } from "@/bootstrap/context.ts";
import type { Database } from "@/database/index.ts";
import * as schema from "@/database/schema.ts";
import { createUser } from "@/features/identity/service.ts";
import { roles } from "@/features/rbac/schema.ts";
import {
  assignRole,
  createRole,
  permissionsForRole,
  permissionsForRoles,
  rolesForUser,
  rolesForUsers,
} from "@/features/rbac/service.ts";
import { createApp } from "@/http/app.ts";
import { createSeededContext, loginOwner, testEnv } from "../../support/fixtures.ts";

let ctx: AppContext;

const actor = { userId: null, traceId: "test", label: "test" } as const;

beforeEach(async () => {
  ctx = await createSeededContext();
});

async function roleIdByKey(key: string): Promise<string> {
  const rows = await ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  if (!rows[0]) throw new Error(`role missing: ${key}`);
  return rows[0].id;
}

test("permissionsForRoles batches the per-role permission lookup", async () => {
  const staff = await roleIdByKey("staff");
  const owner = await roleIdByKey("owner");

  const batched = await permissionsForRoles(ctx.db, [staff, owner]);
  expect(batched.get(staff)).toEqual(["ai.use", "user.read"]);
  expect((batched.get(owner) ?? []).length).toBeGreaterThan(0);
  expect(await permissionsForRole(ctx.db, staff)).toEqual(["ai.use", "user.read"]);

  // An empty id list must not hit the database or invent entries.
  expect((await permissionsForRoles(ctx.db, [])).size).toBe(0);
});

test("rolesForUsers batches role assignments per user", async () => {
  const first = await createUser(
    ctx.db,
    { name: "A", email: "batch-a@example.test", password: "sandi-yang-panjang" },
    actor,
  );
  const second = await createUser(
    ctx.db,
    { name: "B", email: "batch-b@example.test", password: "sandi-yang-panjang" },
    actor,
  );
  await assignRole(ctx.db, { userId: first.id, roleId: await roleIdByKey("staff") });
  await assignRole(ctx.db, { userId: second.id, roleId: await roleIdByKey("owner") });

  const batched = await rolesForUsers(ctx.db, [first.id, second.id]);
  expect(batched.get(first.id)?.map((role) => role.key)).toEqual(["staff"]);
  expect(batched.get(second.id)?.map((role) => role.key)).toEqual(["owner"]);
  expect((await rolesForUser(ctx.db, first.id)).map((role) => role.key)).toEqual(["staff"]);

  expect((await rolesForUsers(ctx.db, [])).size).toBe(0);
});

/**
 * The route used to call `permissionsForRole` once per row (the P1 N+1). On Workers Free that
 * costs a Hyperdrive round-trip and CPU per extra role, so the count is asserted against the real
 * SQL postgres.js sends: one `role_id in (...)` for the whole page, whatever the row count.
 */
test("the roles list route loads permissions with one batched query", async () => {
  for (let index = 0; index < 5; index += 1) {
    await createRole(ctx.db, { key: `probe-${index}`, name: `Probe ${index}` }, actor);
  }

  const statements: string[] = [];
  const client = postgres(testEnv.DATABASE_URL, {
    max: 2,
    onnotice: () => {},
    debug: (_connection, query) => {
      statements.push(query);
    },
  });
  try {
    const app = createApp({ ...ctx, db: drizzle(client, { schema }) as unknown as Database });
    const cookie = await loginOwner(app, ctx.db);

    statements.length = 0;
    const response = await app.request("/api/v1/roles", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(statements.filter((query) => query.includes('"role_permissions"."role_id" in'))).toHaveLength(1);
  } finally {
    await client.end({ timeout: 1 });
  }
});
