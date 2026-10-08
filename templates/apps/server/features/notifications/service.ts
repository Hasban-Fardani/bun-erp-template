import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { countRows, toOffset } from "../../http/helpers/list-query.ts";
import { createNotificationRegistry } from "./channels/registry.ts";
import { notifications } from "./schema.ts";
import type { NotificationChannelContext, NotifyInput } from "./types.ts";
import type { ListNotificationsInput } from "./validation.ts";

export type Notification = typeof notifications.$inferSelect;

/**
 * Fan-out entry point. The database channel is the default in-app inbox; `via` opts into more.
 * Call it after the owning write commits when a missing notification is acceptable, or pass the
 * feature transaction as `tx` when the notification (and any queued mail job) must be atomic with
 * that write — channels then write through `tx` instead of the root database.
 */
export async function notify(ctx: NotificationChannelContext, input: NotifyInput, tx?: Database): Promise<void> {
  const registry = createNotificationRegistry();
  const channelContext = tx ? { ...ctx, db: tx } : ctx;
  for (const name of input.via ?? ["database"]) {
    await registry.create(name, channelContext).send(input);
  }
}

function readFilter(userId: string, read: boolean | undefined) {
  const ownership = eq(notifications.userId, userId);
  if (read === undefined) return ownership;
  return and(ownership, read ? sql`${notifications.readAt} is not null` : isNull(notifications.readAt));
}

export async function listNotifications(
  db: Database,
  userId: string,
  input: ListNotificationsInput,
): Promise<{ items: Notification[]; total: number }> {
  const where = readFilter(userId, input.read);
  const [items, count] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    countRows(db, notifications, where),
  ]);
  return { items, total: count[0]?.total ?? 0 };
}

export async function countUnread(db: Database, userId: string): Promise<number> {
  const rows = await countRows(db, notifications, and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.total ?? 0;
}

/** Titles of the newest unread notifications; the assistant's `unread_notifications` tool reads these. */
export async function listUnreadTitles(db: Database, userId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ title: notifications.title })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => row.title);
}

/** Idempotent: re-reading an already-read row keeps its original timestamp. */
export async function markRead(db: Database, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())`, updatedAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function markAllRead(db: Database, userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}
