import { and, eq, ilike, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { departments } from "./data.ts";
import type { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./schema.ts";

export type Department = typeof departments.$inferSelect;

/**
 * Transaction boundary ada di service (PRD §12). Route hanya memanggil fungsi ini.
 * Organization diambil dari context server — bukan dari input klien.
 */
export async function listDepartments(
  db: Database,
  organizationId: string,
  input: ListDepartmentsInput,
): Promise<{ items: Department[]; total: number }> {
  const where = and(
    eq(departments.organizationId, organizationId),
    input.search ? ilike(departments.name, `%${input.search}%`) : undefined,
  );

  const [items, count] = await Promise.all([
    db.select().from(departments).where(where).orderBy(departments.name).limit(input.limit).offset(input.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(departments).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}

export async function findDepartment(
  db: Database,
  organizationId: string,
  id: string,
): Promise<Department | undefined> {
  const rows = await db
    .select()
    .from(departments)
    .where(and(eq(departments.organizationId, organizationId), eq(departments.id, id)))
    .limit(1);
  return rows[0];
}

export async function createDepartment(
  db: Database,
  organizationId: string,
  input: CreateDepartmentInput,
): Promise<Department> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.organizationId, organizationId), eq(departments.code, input.code)))
      .limit(1);

    // Cek dulu supaya pesan errornya jelas; unique index tetap penjaga terakhir.
    if (existing.length > 0) {
      throw ApiError.conflict("Department code already exists");
    }

    const rows = await tx
      .insert(departments)
      .values({ organizationId, name: input.name, code: input.code })
      .returning();
    return rows[0] as Department;
  });
}

export async function updateDepartment(
  db: Database,
  organizationId: string,
  id: string,
  input: UpdateDepartmentInput,
): Promise<Department> {
  const patch: Partial<Pick<Department, "name" | "code" | "updatedAt">> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.code !== undefined) patch.code = input.code;

  const rows = await db
    .update(departments)
    .set(patch)
    .where(and(eq(departments.organizationId, organizationId), eq(departments.id, id)))
    .returning();

  const updated = rows[0];
  if (!updated) throw ApiError.notFound("Department not found");
  return updated;
}
