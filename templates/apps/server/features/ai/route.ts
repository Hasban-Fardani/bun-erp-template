import { streamSSE } from "hono/streaming";
import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ErrorCode, ok } from "../../http/helpers/errors.ts";
import { validate } from "../../http/helpers/validate.ts";
import { buildConversation, remainingQuestions, spendQuestion } from "./service.ts";
import { ChatInput } from "./validation.ts";

/**
 * Built-in assistant. `POST /chat` answers as server-sent events: `delta` `{ text }` per chunk,
 * then `done` `{ remaining }`, or `error` `{ message }` when the provider fails mid-answer (the
 * status is already 200 by then). Errors before the first byte use the normal JSON envelope.
 */
export function aiRoutes(ctx: AppContext) {
  return factory
    .createApp()
    .get(
      "/status",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Status asisten AI dan sisa pertanyaan hari ini",
        permission: "ai.use",
        data: {
          type: "object",
          properties: {
            available: { type: "boolean" },
            driver: { type: "string" },
            dailyLimit: { type: "integer" },
            remaining: { type: "integer" },
          },
        },
      }),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, {
          available: ctx.ai.available,
          driver: ctx.ai.driver,
          dailyLimit: ctx.env.AI_DAILY_LIMIT,
          remaining: await remainingQuestions(ctx.db, ctx.env, actor.userId),
        });
      },
    )
    .post(
      "/chat",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Tanya asisten AI (jawaban streaming text/event-stream)",
        permission: "ai.use",
        body: ChatInput,
        data: { type: "string", description: "text/event-stream: delta, done, error events" },
      }),
      validate("json", ChatInput),
      async (c) => {
        const actor = c.get("actor");
        if (!ctx.ai.available) {
          throw new ApiError(ErrorCode.unavailable, 503, "The AI assistant is not configured");
        }
        const spent = await spendQuestion(ctx.db, ctx.env, actor.userId);
        if ("retryAfterSeconds" in spent) {
          c.header("Retry-After", String(spent.retryAfterSeconds));
          throw new ApiError(ErrorCode.rateLimited, 429, "Daily AI question limit reached", undefined, {
            retryAfter: spent.retryAfterSeconds,
          });
        }

        const messages = buildConversation(ctx.env, actor, c.req.valid("json"));
        return streamSSE(c, async (stream) => {
          const aborted = new AbortController();
          stream.onAbort(() => aborted.abort());
          try {
            for await (const text of ctx.ai.stream({ messages, signal: aborted.signal })) {
              await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
            }
            await stream.writeSSE({ event: "done", data: JSON.stringify({ remaining: spent.remaining }) });
          } catch (error) {
            if (aborted.signal.aborted) return;
            ctx.logger.error({ event: "ai.chat_failed", driver: ctx.ai.driver, error: String(error) });
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "The AI provider failed" }) });
          }
        });
      },
    );
}
