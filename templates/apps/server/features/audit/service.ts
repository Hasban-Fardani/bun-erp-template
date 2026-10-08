import { and, eq, gte, ilike, lte, or } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { countRows, escapeLikePattern, toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { redactEntity } from "./redact.ts";
import { auditLogs } from "./schema.ts";
import type { ListAuditInput } from "./validation.ts";

export { redactEntity as snapshot };

export type AuditLog = typeof auditLogs.$inferSelect;

export type AuditEvent = {
  actorId?: string | null;
  actorLabel?: string;
  /** `domain.action_result` — the name must stay stable, it is what investigations search for. */
  event: string;
  subjectType: string;
  subjectId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  traceId?: string;
  /** Set when an admin acted as `actorId`; the audit screen renders "by X as Y". */
  impersonator?: { userId: string; label?: string } | null;
};

/** Call from the service (not the route) inside a transaction; snapshots must go through redactEntity. */
export async function recordAudit(db: Database, entry: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel ?? "",
    event: entry.event,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    traceId: entry.traceId ?? "",
    impersonatorId: entry.impersonator?.userId ?? null,
    impersonatorLabel: entry.impersonator?.label ?? "",
  });
}

export async function listAuditLogs(
  db: Database,
  input: ListAuditInput,
): Promise<{ items: AuditLog[]; total: number }> {
  const search = input.search ? `%${escapeLikePattern(input.search)}%` : undefined;
  const where = and(
    search
      ? or(ilike(auditLogs.event, search), ilike(auditLogs.actorLabel, search), ilike(auditLogs.subjectType, search))
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
    countRows(db, auditLogs, where),
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
    // `impersonator` rides along with the actor, so services pass the actor object through unchanged.
    actor: {
      userId: string | null;
      traceId: string;
      label?: string;
      impersonator?: { userId: string; label?: string } | null;
    };
    event: string;
    subject: { type: string; id: string };
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): Promise<void> {
  await recordAudit(tx, {
    actorId: input.actor.userId,
    actorLabel: input.actor.label,
    event: input.event,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    before: input.before,
    after: input.after,
    traceId: input.actor.traceId,
    impersonator: input.actor.impersonator,
  });
}
