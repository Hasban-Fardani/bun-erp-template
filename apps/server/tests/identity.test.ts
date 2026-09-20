import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type AppContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
import { auditLogs } from "../modules/audit/data.ts";
import { redactEntity } from "../modules/audit/redact.ts";
import { accounts } from "../modules/identity/data.ts";
import { permissions, roles } from "../modules/rbac/data.ts";
import { assignRole, permissionsForUser, rolesForUser, seedRbac } from "../modules/rbac/service.ts";
import { seed } from "../platform/database/seed.ts";
import { createTestContext, truncateAll } from "./helpers.ts";

let ctx: AppContext;
let orgId: string;
let app: ReturnType<typeof createApp>;

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Mendaftar lewat jalur Better Auth yang sesungguhnya — bukan menulis baris user langsung. */
async function signUp(email: string, password = "sandi-yang-panjang") {
  const res = await app.request("/api/v1/auth/sign-up/email", json({ email, password, name: email.split("@")[0] }));
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string } };
}

async function signIn(email: string, password = "sandi-yang-panjang") {
  return app.request("/api/v1/auth/sign-in/email", json({ email, password }));
}

/** Cookie sesi dari hasil sign-in, untuk request berikutnya. */
async function sessionCookie(email: string, password = "sandi-yang-panjang"): Promise<string> {
  const res = await signIn(email, password);
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie") ?? "";
}

async function roleIdByKey(key: string): Promise<string> {
  const rows = await ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error(`role not seeded: ${key}`);
  return id;
}

beforeEach(async () => {
  ctx ??= await createTestContext();
  await truncateAll(ctx);
  await seed(ctx.db);
  orgId = await resolveDefaultOrganizationId(ctx.db);
  app = createApp(ctx, orgId);
});

afterAll(async () => {
  await ctx?.close();
});

describe("identity", () => {
  test("sign-up through Better Auth creates a uuidv7 primary key", async () => {
    const { user } = await signUp("orang@example.test");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    // uuidv7 — digit ke-15 menandai versi 7 (bukan 4 seperti uuid acak).
    expect(user.id[14]).toBe("7");
  });

  test("password is hashed, never stored as plaintext", async () => {
    const { user } = await signUp("hash@example.test", "rahasia-yang-panjang");
    const rows = await ctx.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, user.id));
    expect(rows.length).toBe(1);
    const stored = rows[0]?.password ?? "";
    expect(stored).not.toContain("rahasia-yang-panjang");
    expect(stored.length).toBeGreaterThan(40);
  });

  test("wrong password is rejected with 401, not 500", async () => {
    await signUp("salah@example.test");
    const res = await signIn("salah@example.test", "sandi-yang-salah-panjang");
    expect(res.status).toBe(401);
  });

  test("anonymous request to a private route is 401 UNAUTHORIZED", async () => {
    const res = await app.request("/api/v1/users");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("authenticated user without permission is 403 FORBIDDEN, not 401", async () => {
    const { user } = await signUp("tanpa-izin@example.test");
    const cookie = await sessionCookie("tanpa-izin@example.test");
    const res = await app.request("/api/v1/users", { headers: { cookie } });
    // 403 (bukan 401) membuktikan identitasnya dikenali tetapi izinnya kurang.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(user.id).toBeTruthy();
  });

  test("user holding the owner role passes the permission check", async () => {
    const { user } = await signUp("owner@example.test");
    await assignRole(ctx.db, { userId: user.id, roleId: await roleIdByKey("owner") });

    const permissions = await permissionsForUser(ctx.db, user.id);
    expect(permissions).toContain("user.read");
    expect(permissions).toContain("role.assign");

    const cookie = await sessionCookie("owner@example.test");
    const res = await app.request("/api/v1/users", { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  test("staff can read the directory but cannot assign roles", async () => {
    const { user } = await signUp("staff@example.test");
    await assignRole(ctx.db, { userId: user.id, roleId: await roleIdByKey("staff") });
    const cookie = await sessionCookie("staff@example.test");

    // `staff` memegang user.read — membaca daftar pengguna memang boleh.
    expect((await app.request("/api/v1/users", { headers: { cookie } })).status).toBe(200);

    // Tetapi tidak memegang role.assign: ini yang harus ditolak, dan dengan 403.
    const res = await app.request(`/api/v1/users/${user.id}/roles`, {
      ...json({ roleKey: "owner" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("role.assign");
  });

  test("/me reports the caller's own permissions", async () => {
    const { user } = await signUp("saya@example.test");
    const cookie = await sessionCookie("saya@example.test");
    const res = (await (await app.request("/api/v1/me", { headers: { cookie } })).json()) as {
      data: { userId: string; permissions: string[] };
    };
    expect(res.data.userId).toBe(user.id);
    // User baru belum punya role: izin kosong, bukan error.
    expect(res.data.permissions).toEqual([]);
  });

  test("seed creates the permission catalogue from code", async () => {
    const keys = (await ctx.db.select({ key: permissions.key }).from(permissions)).map((r) => r.key);
    expect(keys).toContain("user.create");
    expect(keys).toContain("role.assign");
    expect(keys).toContain("audit.read");
  });

  test("seeding twice is idempotent and keeps two system roles", async () => {
    const again = await seedRbac(ctx.db, orgId);
    expect(again.roles).toBe(2);
    const roleRows = await ctx.db.select({ key: roles.key }).from(roles);
    expect(roleRows.map((r) => r.key).sort()).toEqual(["owner", "staff"]);
  });

  test("assigning a role writes an audit row with a named event and trace id", async () => {
    // Pelaku harus memegang role.assign; tanpa itu route menolak dan tidak ada catatan
    // audit — perilaku yang benar, tapi bukan yang sedang diuji di sini.
    const admin = await signUp("admin-audit@example.test");
    await assignRole(ctx.db, { userId: admin.user.id, roleId: await roleIdByKey("owner") });
    const cookie = await sessionCookie("admin-audit@example.test");

    const target = await signUp("diaudit@example.test");
    const res = await app.request(`/api/v1/users/${target.user.id}/roles`, {
      ...json({ roleKey: "staff" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(res.status).toBe(200);

    const logs = await ctx.db.select().from(auditLogs).where(eq(auditLogs.subjectId, target.user.id));
    const assigned = logs.find((l) => l.event === "user.role_assigned");
    expect(assigned).toBeDefined();
    expect(assigned?.subjectType).toBe("user");
    expect(assigned?.traceId).not.toBe("");
    // Pelaku tercatat sebagai teks beku — jejak tanpa pelaku tidak bisa ditelusuri.
    expect(assigned?.actorId).toBe(admin.user.id);
    expect(assigned?.actorLabel).toBe("admin-audit@example.test");
    // Snapshot hanya memuat field yang di-allowlist, bukan record mentah.
    expect(assigned?.after).toMatchObject({ entity: "userRole", roleId: expect.any(String) });
  });

  test("audit redaction drops secrets even when the entity allows the field name", () => {
    const snapshot = redactEntity("user", {
      id: "u1",
      name: "Budi",
      email: "budi@example.test",
      password: "sandi-asli-yang-panjang",
      token: "sesi-rahasia",
      apiKey: "kunci-rahasia",
    } as unknown as Record<string, unknown>);
    expect(snapshot).toMatchObject({ entity: "user", id: "u1", name: "Budi" });
    expect(JSON.stringify(snapshot)).not.toContain("sandi-asli-yang-panjang");
    expect(JSON.stringify(snapshot)).not.toContain("sesi-rahasia");
    expect(JSON.stringify(snapshot)).not.toContain("kunci-rahasia");
  });

  test("a role can be scoped to a department, and scope survives the round trip", async () => {
    const { user } = await signUp("manajer@example.test");

    // Lingkup diuji langsung di service: route hanya meneruskan nilainya.
    await assignRole(ctx.db, {
      userId: user.id,
      roleId: await roleIdByKey("staff"),
      scopeType: "department",
      scopeId: "0199aaaa-0000-7000-8000-000000000000",
    });

    const held = await rolesForUser(ctx.db, user.id);
    expect(held.length).toBe(1);
    expect(held[0]?.scopeType).toBe("department");
    expect(held[0]?.scopeId).toBe("0199aaaa-0000-7000-8000-000000000000");
  });

  test("role catalogue is readable and matches the code, not a copy", async () => {
    const admin = await signUp("admin-roles@example.test");
    await assignRole(ctx.db, { userId: admin.user.id, roleId: await roleIdByKey("owner") });
    const cookie = await sessionCookie("admin-roles@example.test");

    const res = await app.request("/api/v1/roles", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: { key: string; isSystem: boolean }[]; total: number } };
    expect(body.data.items.map((r) => r.key).sort()).toEqual(["owner", "staff"]);
    expect(body.data.items.every((r) => r.isSystem)).toBe(true);

    // Katalog statemen dibaca dari kode: kalau daftarnya disalin ke route, ini akan basi.
    const catalog = await app.request("/api/v1/roles/statements", { headers: { cookie } });
    const catalogBody = (await catalog.json()) as {
      data: { statements: Record<string, string[]>; permissions: string[] };
    };
    expect(catalogBody.data.permissions).toContain("role.assign");
    expect(catalogBody.data.permissions).toContain("audit.read");
    // Setiap izin yang diumumkan katalog harus punya bentuk resource.action.
    for (const key of catalogBody.data.permissions) {
      const [resource, action] = key.split(".");
      expect(resource && action).toBeTruthy();
      expect(catalogBody.data.statements[resource as string]).toContain(action as string);
    }
  });

  test("scope pair must be given together", async () => {
    const { user } = await signUp("setengah@example.test");
    await expect(
      assignRole(ctx.db, { userId: user.id, roleId: await roleIdByKey("staff"), scopeType: "department" }),
    ).rejects.toThrow(/together/);
  });
});
