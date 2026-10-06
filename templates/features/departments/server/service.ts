import { and, eq, ilike, type SQL, sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { bumpVersion, versionGuard } from "../../database/optimistic-locking.ts";
import { forceDeleteRow, notDeleted, restoreRow, softDeleteRow } from "../../database/soft-delete.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { departments } from "./schema.ts";
import type { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./validation.ts";

export type Department = typeof departments.$inferSelect;

type Actor = { userId: string | null; traceId: string; label?: string };

/**
 * The transaction boundary lives in the service (PRD §12). Routes only call these functions.
 * Reads exclude soft-deleted rows unless the caller asks for them.
 */
export async function listDepartments(
  db: Database,
  input: ListDepartmentsInput,
): Promise<{ items: Department[]; total: number }> {
  const filters: SQL[] = [];
  if (!input.includeDeleted) filters.push(notDeleted(departments));
  if (input.search) filters.push(ilike(departments.name, `%${input.search}%`));
  const where = filters.length > 0 ? and(...filters) : undefined;

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

export async function findDepartment(
  db: Database,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Department | undefined> {
  const where = options.includeDeleted ? eq(departments.id, id) : and(eq(departments.id, id), notDeleted(departments));
  const rows = await db.select().from(departments).where(where).limit(1);
  return rows[0];
}

/** Loads the row (optionally including deleted) or 404s before any write. */
async function requireDepartment(
  tx: Database,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Department> {
  const before = await findDepartment(tx, id, options);
  if (!before) throw ApiError.notFound("Department not found");
  return before;
}

export async function createDepartment(
  db: Database,
  input: CreateDepartmentInput,
  actor: Actor = { userId: null, traceId: "" },
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
    await recordDepartmentEvent(tx as unknown as Database, actor, "department.created", after.id, undefined, after);
    return after;
  });
}

export async function updateDepartment(
  db: Database,
  id: string,
  input: UpdateDepartmentInput,
  actor: Actor = { userId: null, traceId: "" },
): Promise<Department> {
  return db.transaction(async (tx) => {
    const before = await requireDepartment(tx as unknown as Database, id);

    const patch: { name?: string; code?: string; updatedAt: Date; version: SQL } = {
      updatedAt: new Date(),
      version: bumpVersion(departments),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;

    // One statement: the data change and the version bump happen together, guarded by the version.
    const rows = await tx
      .update(departments)
      .set(patch)
      .where(versionGuard(departments, id, input.expectedVersion))
      .returning();
    const after = rows[0];
    if (!after) {
      const current = await findDepartment(tx as unknown as Database, id, { includeDeleted: true });
      if (!current) throw ApiError.notFound("Department not found");
      throw ApiError.versionConflict(current.version);
    }

    await recordDepartmentEvent(tx as unknown as Database, actor, "department.updated", after.id, before, after);
    return after;
  });
}

export async function deleteDepartment(
  db: Database,
  id: string,
  actor: Actor = { userId: null, traceId: "" },
): Promise<Department> {
  return db.transaction(async (tx) => {
    const before = await requireDepartment(tx as unknown as Database, id);

    const after = await softDeleteRow(tx as unknown as Database, departments, id);
    if (!after) throw ApiError.notFound("Department not found");

    await recordDepartmentEvent(tx as unknown as Database, actor, "department.deleted", id, before, after);
    return after;
  });
}

export async function restoreDepartment(
  db: Database,
  id: string,
  actor: Actor = { userId: null, traceId: "" },
): Promise<Department> {
  return db.transaction(async (tx) => {
    const before = await requireDepartment(tx as unknown as Database, id, { includeDeleted: true });

    const after = await restoreRow(tx as unknown as Database, departments, id);
    if (!after) throw ApiError.notFound("Department not found");

    await recordDepartmentEvent(tx as unknown as Database, actor, "department.restored", id, before, after);
    return after;
  });
}

export async function forceDeleteDepartment(
  db: Database,
  id: string,
  actor: Actor = { userId: null, traceId: "" },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = await requireDepartment(tx as unknown as Database, id, { includeDeleted: true });

    await forceDeleteRow(tx as unknown as Database, departments, id);

    await recordDepartmentEvent(tx as unknown as Database, actor, "department.force_deleted", id, before, undefined);
    return { id };
  });
}

/** One audit shape for every department state change; the event name is the only variable. */
async function recordDepartmentEvent(
  db: Database,
  actor: Actor,
  event: string,
  id: string,
  before: Department | undefined,
  after: Department | undefined,
): Promise<void> {
  await auditChange(db, {
    actor,
    event,
    subject: { type: "department", id },
    ...(before ? { before: snapshot("department", before) } : {}),
    ...(after ? { after: snapshot("department", after) } : {}),
  });
}
