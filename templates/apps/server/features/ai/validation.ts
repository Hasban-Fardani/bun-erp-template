import * as z from "zod";
import { listQueryParts } from "../../http/helpers/list-query.ts";

/** Turns the browser keeps; older turns are dropped client-side so a long chat stays cheap. */
export const MAX_TURNS = 20;

/** Turns the server loads from the database as model context in `full` history mode. */
export const MAX_CONTEXT_TURNS = 12;

/**
 * The browser sends the visible conversation; the system prompt is server-owned, so a client cannot
 * send a `system` turn. The last turn is the question being asked. With `AI_HISTORY=full` and a
 * `conversationId`, the server ignores the earlier turns and loads its own copy; `replaceFrom` names
 * a stored turn to drop (with everything after it) first, which is how regenerate and edit work.
 */
export const chatSchema = z.strictObject({
  messages: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(MAX_TURNS)
    .refine((messages) => messages.at(-1)?.role === "user", { message: "the last message must be from the user" }),
  conversationId: z.uuid().optional(),
  skill: z.string().trim().min(1).max(64).optional(),
  replaceFrom: z.uuid().optional(),
});

export const ChatInput = z.compile(chatSchema);

export type ChatInput = z.output<typeof ChatInput>;

export const listConversationsSchema = z.strictObject(
  listQueryParts({ sortable: ["updatedAt"] as const, defaultSort: "updatedAt", defaultDir: "desc" }),
);

export const ListConversationsInput = z.compile(listConversationsSchema);

export type ListConversationsInput = z.output<typeof ListConversationsInput>;

export const renameConversationSchema = z.strictObject({ title: z.string().trim().min(1).max(120) });

export const RenameConversationInput = z.compile(renameConversationSchema);
