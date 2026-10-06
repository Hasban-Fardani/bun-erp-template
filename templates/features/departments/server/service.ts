import { eq, ilike, sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { departments } from "./schema.ts";
import type { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./validation.ts";

export type Department = typeof departments.$inferSelect;

/**
 * The transaction boundary lives in the service (PRD §12). Routes only call these functions.
 */
export async function listDepartments(
  db: Database,
  input: ListDepartmentsInput,
): Promise<{ items: Department[]; total: number }> {
  const where = input.search ? ilike(departments.name, `%${input.search}%`) : undefined;

  const [items, count] = await Promise.all([
    db
      .select()
      .from(departments)
      .where(where)
      .orderBy(...orderByColumn(departments, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    db.select({ total: sql<number>`count(*)::int` }).from(departments).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}

export async function findDepartment(db: Database, id: string): Promise<Department | undefined> {
  const rows = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
  return rows[0];
}

export async function createDepartment(
  db: Database,
  input: CreateDepartmentInput,
  actor: { userId: string | null; traceId: string; label?: string } = { userId: null, traceId: "" },
): Promise<Department> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.code, input.code))
      .limit(1);

    // Check first so the error message is clear; the unique index stays the last line of defence.
    if (existing.length > 0) {
      throw ApiError.conflict("Department code already exists");
    }

    const rows = await tx.insert(departments).values({ name: input.name, code: input.code }).returning();
    const after = rows[0] as Department;
    await recordDepartmentChange(tx as unknown as Database, actor, after);
    return after;
  });
}

export async function updateDepartment(
  db: Database,
  id: string,
  input: UpdateDepartmentInput,
  actor: { userId: string | null; traceId: string; label?: string } = { userId: null, traceId: "" },
): Promise<Department> {
  return db.transaction(async (tx) => {
    const before = await findDepartment(tx as unknown as Database, id);
    if (!before) throw ApiError.notFound("Department not found");
    const patch: Partial<Pick<Department, "name" | "code" | "updatedAt">> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    const rows = await tx.update(departments).set(patch).where(eq(departments.id, id)).returning();
    const after = rows[0] as Department;
    await recordDepartmentChange(tx as unknown as Database, actor, after, before);
    return after;
  });
}

async function recordDepartmentChange(
  db: Database,
  actor: { userId: string | null; traceId: string; label?: string },
  after: Department,
  before?: Department,
): Promise<void> {
  await auditChange(db, {
    actor,
    event: before ? "department.updated" : "department.created",
    subject: { type: "department", id: after.id },
    ...(before ? { before: snapshot("department", before) } : {}),
    after: snapshot("department", after),
  });
}
