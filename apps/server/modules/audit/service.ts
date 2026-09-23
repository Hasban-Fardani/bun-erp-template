import { and, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { toOffset } from "../../http/list-query.ts";
import { orderByColumn } from "../../http/sort.ts";
import type { Database } from "../../platform/database/index.ts";
import { auditLogs } from "./data.ts";
import { redactEntity } from "./redact.ts";
import type { ListAuditInput } from "./schema.ts";

export { redactEntity as snapshot };

export type AuditLog = typeof auditLogs.$inferSelect;

export type AuditEvent = {
  organizationId?: string | null;
  actorId?: string | null;
  actorLabel?: string;
  /** `domain.action_result` — the name must stay stable, it is what investigations search for. */
  event: string;
  subjectType: string;
  subjectId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  traceId?: string;
};

/** Call from the service (not the route) inside a transaction; snapshots must go through redactEntity. */
export async function recordAudit(db: Database, entry: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: entry.organizationId ?? null,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel ?? "",
    event: entry.event,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    traceId: entry.traceId ?? "",
  });
}

export async function listAuditLogs(
  db: Database,
  organizationId: string,
  input: ListAuditInput,
): Promise<{ items: AuditLog[]; total: number }> {
  const where = and(
    eq(auditLogs.organizationId, organizationId),
    input.search
      ? or(
          ilike(auditLogs.event, `%${input.search}%`),
          ilike(auditLogs.actorLabel, `%${input.search}%`),
          ilike(auditLogs.subjectType, `%${input.search}%`),
        )
      : undefined,
    input.event ? eq(auditLogs.event, input.event) : undefined,
    input.subjectType ? eq(auditLogs.subjectType, input.subjectType) : undefined,
    input.subjectId ? eq(auditLogs.subjectId, input.subjectId) : undefined,
    input.since ? gte(auditLogs.createdAt, input.since) : undefined,
    input.until ? lte(auditLogs.createdAt, input.until) : undefined,
  );

  const [items, count] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(...orderByColumn(auditLogs, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}

/**
 * Records an audited change from inside a transaction. Every call site used to repeat the same
 * six fields around the event-specific ones; this keeps the shape in one place so a new write
 * path cannot forget `traceId` or `actorLabel`.
 */
export async function auditChange(
  tx: Database,
  input: {
    organizationId: string;
    actor: { userId: string | null; traceId: string; label?: string };
    event: string;
    subject: { type: string; id: string };
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): Promise<void> {
  await recordAudit(tx, {
    organizationId: input.organizationId,
    actorId: input.actor.userId,
    actorLabel: input.actor.label,
    event: input.event,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    before: input.before,
    after: input.after,
    traceId: input.actor.traceId,
  });
}
