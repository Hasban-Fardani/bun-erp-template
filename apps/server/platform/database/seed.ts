import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";
import { organizations } from "./schema.ts";

/**
 * Seed idempotent. Hanya data infrastruktur — tidak ada domain client yang dikarang
 * (governance: zero domain fabrication). Modul bisnis menambah seed-nya sendiri.
 */
export async function seed(db: Database): Promise<{ organizations: number }> {
  const rows = await db
    .insert(organizations)
    .values({ name: "Default Organization", slug: "default" })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });

  await db.execute(sql`select 1`);
  return { organizations: rows.length };
}
