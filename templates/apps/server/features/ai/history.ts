import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";
import { countRows, toOffset } from "../../http/helpers/list-query.ts";
import { type AiMessageMeta, aiConversations, aiMessages } from "./schema.ts";
import type { ListConversationsInput } from "./validation.ts";

export type Conversation = typeof aiConversations.$inferSelect;
export type StoredMessage = typeof aiMessages.$inferSelect;

const TITLE_MAX = 60;

/** A cheap, deterministic title: the first question, collapsed to one line and shortened. */
export function titleFrom(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

const owned = (userId: string, id: string) => and(eq(aiConversations.id, id), eq(aiConversations.userId, userId));

export async function createConversation(db: Database, userId: string, title: string): Promise<Conversation> {
  const rows = await db.insert(aiConversations).values({ userId, title }).returning();
  const row = rows[0];
  if (!row) throw new Error("conversation insert returned no row");
  return row;
}

/** Self-scoped lookup: another user's id behaves exactly like a missing one. */
export async function findConversation(db: Database, userId: string, id: string): Promise<Conversation | undefined> {
  const rows = await db.select().from(aiConversations).where(owned(userId, id)).limit(1);
  return rows[0];
}

export async function listConversations(
  db: Database,
  userId: string,
  input: ListConversationsInput,
): Promise<{ items: Conversation[]; total: number }> {
  const where = eq(aiConversations.userId, userId);
  const [items, count] = await Promise.all([
    db
      .select()
      .from(aiConversations)
      .where(where)
      .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    countRows(db, aiConversations, where),
  ]);
  return { items, total: count[0]?.total ?? 0 };
}

export async function renameConversation(db: Database, userId: string, id: string, title: string): Promise<boolean> {
  const rows = await db
    .update(aiConversations)
    .set({ title })
    .where(owned(userId, id))
    .returning({ id: aiConversations.id });
  return rows.length > 0;
}

export async function deleteConversation(db: Database, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(aiConversations).where(owned(userId, id)).returning({ id: aiConversations.id });
  return rows.length > 0;
}

export async function setSummary(db: Database, id: string, summary: string): Promise<void> {
  await db.update(aiConversations).set({ summary, updatedAt: new Date() }).where(eq(aiConversations.id, id));
}

export async function touchConversation(db: Database, id: string): Promise<void> {
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, id));
}

/** Every turn of a conversation, oldest first (the transcript the screen shows). */
export async function listMessages(db: Database, conversationId: string): Promise<StoredMessage[]> {
  return db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id));
}

/** The newest `limit` turns, oldest first: what the model is shown as context. */
export async function recentMessages(db: Database, conversationId: string, limit: number): Promise<StoredMessage[]> {
  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
    .limit(limit);
  return rows.reverse();
}

export async function addMessage(
  db: Database,
  input: { conversationId: string; role: "user" | "assistant"; content: string; meta?: AiMessageMeta | null },
): Promise<string> {
  const rows = await db
    .insert(aiMessages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      meta: input.meta ?? null,
    })
    .returning({ id: aiMessages.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("message insert returned no row");
  return id;
}

/**
 * Drops the named turn and every later one, comparing in SQL so microsecond ordering survives. A turn
 * from another conversation matches nothing.
 */
export async function truncateFrom(db: Database, conversationId: string, messageId: string): Promise<boolean> {
  const result = await db.execute(sql`
    delete from ai_messages
    where conversation_id = ${conversationId}
      and (created_at, id) >= (
        select created_at, id from ai_messages where id = ${messageId} and conversation_id = ${conversationId}
      )
    returning id
  `);
  return rowsOf(result).length > 0;
}
