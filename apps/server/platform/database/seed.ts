import { eq, sql } from "drizzle-orm";
import { seedRbac } from "../../modules/rbac/service.ts";
import type { Database } from "./index.ts";
import { organizations } from "./schema.ts";

/**
 * Idempotent seed. Infrastructure data only — no invented client domain
 * (governance: zero domain fabrication). Business modules add their own seed.
 */
export async function seed(db: Database): Promise<{ organizations: number; roles: number; permissions: number }> {
  const rows = await db
    .insert(organizations)
    .values({ name: "Default Organization", slug: "default" })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });

  await db.execute(sql`select 1`);

  // The organization is read back, not taken from `rows`: on the second seed,
  // `onConflictDoNothing` returns nothing.
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "default"))
    .limit(1);
  const organizationId = existing[0]?.id;
  if (!organizationId) throw new Error("Default organization missing after seed");

  // RBAC is seeded too because system roles are infrastructure, not business data:
  // without the `owner` role, nobody can grant the first permission.
  const rbac = await seedRbac(db, organizationId);

  return { organizations: rows.length, roles: rbac.roles, permissions: rbac.permissions };
}
