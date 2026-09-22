import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../../platform/database/index.ts";
import { auditLogs } from "./data.ts";
import { redactEntity } from "./redact.ts";

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
  input: {
    limit: number;
    offset: number;
    event?: string;
    subjectType?: string;
    subjectId?: string;
    since?: Date;
    until?: Date;
  },
): Promise<{ items: AuditLog[]; total: number }> {
  const where = and(
    eq(auditLogs.organizationId, organizationId),
    input.event ? eq(auditLogs.event, input.event) : undefined,
    input.subjectType ? eq(auditLogs.subjectType, input.subjectType) : undefined,
    input.subjectId ? eq(auditLogs.subjectId, input.subjectId) : undefined,
    input.since ? gte(auditLogs.createdAt, input.since) : undefined,
    input.until ? lte(auditLogs.createdAt, input.until) : undefined,
  );

  const [items, count] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}
