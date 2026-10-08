import { streamSSE } from "hono/streaming";
import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ErrorCode, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { idParam } from "../../http/helpers/params.ts";
import { validate } from "../../http/helpers/validate.ts";
import { runChat } from "./chat.ts";
import {
  type Conversation,
  deleteConversation,
  findConversation,
  listConversations,
  listMessages,
  renameConversation,
} from "./history.ts";
import { remainingQuestions, spendQuestion } from "./service.ts";
import { resolveSkill, type Skill, skillsFor } from "./skills/index.ts";
import { ChatInput, ListConversationsInput, RenameConversationInput } from "./validation.ts";

const conversationRef = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const publicConversation = (row: Conversation) => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Built-in assistant. `POST /chat` answers as server-sent events: `conversation` (when history is
 * kept), `tool` per tool call, `delta` `{ text }` per chunk, then `done`, or `error` `{ message }`
 * when the provider fails mid-answer (the status is already 200 by then). Errors before the first
 * byte use the normal JSON envelope. Conversations are self-scoped like notifications: every query
 * filters on the actor, so another user's id is a 404.
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
            history: { type: "string", enum: ["full", "summary", "off"] },
            toolsEnabled: { type: "boolean" },
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
          history: ctx.env.AI_HISTORY,
          toolsEnabled: ctx.env.AI_TOOLS_ENABLED && ctx.env.AI_MAX_TOOL_CALLS > 0 && ctx.ai.plan !== undefined,
        });
      },
    )
    .get(
      "/skills",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Skill asisten AI yang boleh dipakai",
        permission: "ai.use",
        data: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
          },
        },
      }),
      async (c) => {
        const actor = c.get("actor");
        return ok(
          c,
          skillsFor(actor).map(({ key, title, description }) => ({ key, title, description })),
        );
      },
    )
    .get(
      "/conversations",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Daftar percakapan AI saya",
        permission: "ai.use",
        query: ListConversationsInput,
        data: {
          type: "object",
          properties: { items: { type: "array", items: conversationRef }, ...listMetaSchemaProperties },
        },
      }),
      validate("query", ListConversationsInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("query");
        const { items, total } = await listConversations(ctx.db, actor.userId, input);
        return ok(c, { items: items.map(publicConversation), ...listMeta(input, total) });
      },
    )
    .get(
      "/conversations/:id",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Satu percakapan AI beserta pesannya (mode full)",
        permission: "ai.use",
        data: {
          type: "object",
          properties: {
            conversation: conversationRef,
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  role: { type: "string" },
                  content: { type: "string" },
                  meta: { type: ["object", "null"] },
                  createdAt: { type: "string" },
                },
              },
            },
          },
        },
      }),
      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        const conversation = await findConversation(ctx.db, actor.userId, c.req.param("id"));
        if (!conversation) throw ApiError.notFound("Conversation not found");
        const messages = await listMessages(ctx.db, conversation.id);
        return ok(c, {
          conversation: publicConversation(conversation),
          messages: messages.map(({ id, role, content, meta, createdAt }) => ({ id, role, content, meta, createdAt })),
        });
      },
    )
    .patch(
      "/conversations/:id",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Ganti judul percakapan AI",
        permission: "ai.use",
        body: RenameConversationInput,
        data: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } },
      }),
      validate("param", idParam),
      validate("json", RenameConversationInput),
      async (c) => {
        const { title } = c.req.valid("json");
        const id = c.req.param("id");
        const actor = c.get("actor");
        if (!(await renameConversation(ctx.db, actor.userId, id, title))) {
          throw ApiError.notFound("Conversation not found");
        }
        return ok(c, { id, title });
      },
    )
    .delete(
      "/conversations/:id",
      authorize(ctx, "ai.use"),
      doc({
        tag: "ai",
        summary: "Hapus percakapan AI",
        permission: "ai.use",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),
      validate("param", idParam),
      async (c) => {
        const id = c.req.param("id");
        const actor = c.get("actor");
        if (!(await deleteConversation(ctx.db, actor.userId, id))) throw ApiError.notFound("Conversation not found");
        return ok(c, { id });
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
        data: {
          type: "string",
          description: "text/event-stream: conversation, tool, delta, done, error events",
        },
      }),
      validate("json", ChatInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        if (!ctx.ai.available) {
          throw new ApiError(ErrorCode.unavailable, 503, "The AI assistant is not configured");
        }

        let chosen: Skill | undefined;
        if (input.skill) {
          const resolved = resolveSkill(actor, input.skill);
          if ("error" in resolved) {
            if (resolved.error === "forbidden") throw ApiError.forbidden("This skill is not available to you");
            throw new ApiError(ErrorCode.validationFailed, 422, "Unknown skill", [
              { path: "skill", message: "unknown skill" },
            ]);
          }
          chosen = resolved.skill;
        }

        let conversation: Conversation | undefined;
        if (input.conversationId && ctx.env.AI_HISTORY !== "off") {
          conversation = await findConversation(ctx.db, actor.userId, input.conversationId);
          if (!conversation) throw ApiError.notFound("Conversation not found");
        }

        const spent = await spendQuestion(ctx.db, ctx.env, actor.userId);
        if ("retryAfterSeconds" in spent) {
          c.header("Retry-After", String(spent.retryAfterSeconds));
          throw new ApiError(ErrorCode.rateLimited, 429, "Daily AI question limit reached", undefined, {
            retryAfter: spent.retryAfterSeconds,
          });
        }

        return streamSSE(c, async (stream) => {
          const aborted = new AbortController();
          stream.onAbort(() => aborted.abort());
          try {
            for await (const event of runChat({
              ctx,
              actor,
              input,
              skill: chosen,
              conversation,
              remaining: spent.remaining,
              signal: aborted.signal,
            })) {
              await stream.writeSSE({ event: event.event, data: JSON.stringify(event.data) });
            }
          } catch (error) {
            if (aborted.signal.aborted) return;
            ctx.logger.error({ event: "ai.chat_failed", driver: ctx.ai.driver, error: String(error) });
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "The AI provider failed" }) });
          }
        });
      },
    );
}
