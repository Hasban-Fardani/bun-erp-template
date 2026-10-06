import { eq } from "drizzle-orm";
import { createContext } from "../../bootstrap/bootstrap.ts";
import { loadEnv } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { users } from "../../features/identity/schema.ts";
import { roles as roleTable } from "../../features/rbac/schema.ts";
import { findRoleByKey } from "../../features/rbac/service.ts";

/** CLI commands act without a session; audit still records the operator as `cli`. */
export function cliActor(): { userId: null; traceId: string; label: string } {
  return { userId: null, traceId: `cli-${Date.now()}`, label: "cli" };
}

export async function createCliContext(options: Parameters<typeof createContext>[0] = {}) {
  return createContext({ ...options, env: options.env ?? loadEnv() });
}

export async function requireRoleByKey(db: Database, organizationId: string, key: string) {
  const role = await findRoleByKey(db, organizationId, key);
  if (role) return role;
  const available = await db
    .select({ key: roleTable.key })
    .from(roleTable)
    .where(eq(roleTable.organizationId, organizationId))
    .orderBy(roleTable.key);
  throw new Error(
    `No role "${key}" in this organization. Available: ${available.map((row) => row.key).join(", ") || "none"}. Run bun erp role:list.`,
  );
}

export async function requireUserByEmail(db: Database, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) throw new Error(`No user with email ${email}. Run bun erp user:list.`);
  return user;
}
