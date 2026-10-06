import { sql } from "drizzle-orm";
import { seedRbac } from "../features/rbac/service.ts";
import type { Database } from "./index.ts";

/**
 * Idempotent seed. Infrastructure data only — no invented client domain
 * (governance: zero domain fabrication). Business modules add their own seed.
 */
export async function seed(db: Database): Promise<{ roles: number; permissions: number }> {
  await db.execute(sql`select 1`);

  // RBAC is seeded because system roles are infrastructure, not business data:
  // without the `owner` role, nobody can grant the first permission.
  const rbac = await seedRbac(db);

  return { roles: rbac.roles, permissions: rbac.permissions };
}
