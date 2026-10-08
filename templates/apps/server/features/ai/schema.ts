import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/index.ts";

/**
 * One row per assistant conversation, owned by one user. `AI_HISTORY=summary` keeps only this row
 * (title + a short rolling summary); `full` also keeps the turns in `ai_messages`.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_conversations_user_idx").on(table.userId, table.updatedAt)],
);

export type AiMessageMeta = {
  skill?: string;
  tools?: { name: string; status: "done" | "error" }[];
};

/** Turns of a `full` conversation. Message content is never logged or audited. */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    meta: jsonb("meta").$type<AiMessageMeta | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_messages_conversation_idx").on(table.conversationId, table.createdAt, table.id)],
);
