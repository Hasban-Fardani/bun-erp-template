import { eq } from "drizzle-orm";
import type { Database } from "./index.ts";
import { organizations } from "./schema.ts";

/** Terpisah dari context.ts untuk memutus lingkaran impor context -> auth -> context. */
export async function resolveDefaultOrganizationId(db: Database, slug = "default"): Promise<string> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error("Default organization missing — run `bun erp db:seed`");
  return id;
}
