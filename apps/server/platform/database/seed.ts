import { eq, sql } from "drizzle-orm";
import { seedRbac } from "../../modules/rbac/service.ts";
import type { Database } from "./index.ts";
import { organizations } from "./schema.ts";

/**
 * Seed idempotent. Hanya data infrastruktur — tidak ada domain client yang dikarang
 * (governance: zero domain fabrication). Modul bisnis menambah seed-nya sendiri.
 */
export async function seed(db: Database): Promise<{ organizations: number; roles: number; permissions: number }> {
  const rows = await db
    .insert(organizations)
    .values({ name: "Default Organization", slug: "default" })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });

  await db.execute(sql`select 1`);

  // Organisasi dibaca ulang, bukan diambil dari `rows`: pada seed kedua,
  // `onConflictDoNothing` tidak mengembalikan apa pun.
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "default"))
    .limit(1);
  const organizationId = existing[0]?.id;
  if (!organizationId) throw new Error("Default organization missing after seed");

  // RBAC ikut di-seed karena role sistem adalah infrastruktur, bukan data bisnis:
  // tanpa role `owner`, tidak ada seorang pun yang bisa memberi izin pertama.
  const rbac = await seedRbac(db, organizationId);

  return { organizations: rows.length, roles: rbac.roles, permissions: rbac.permissions };
}
