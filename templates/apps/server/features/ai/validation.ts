import * as z from "zod";

/** Turns the browser keeps; older turns are dropped client-side so a long chat stays cheap. */
export const MAX_TURNS = 20;

/**
 * The browser sends the visible conversation; the system prompt is server-owned, so a client cannot
 * send a `system` turn. The last turn is the question being asked.
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
});

export const ChatInput = z.compile(chatSchema);

export type ChatInput = z.output<typeof ChatInput>;
