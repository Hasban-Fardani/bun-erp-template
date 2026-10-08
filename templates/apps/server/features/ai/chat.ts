import type { AppContext } from "../../bootstrap/context.ts";
import type { AiMessage } from "../../infra/ai/index.ts";
import type { Actor } from "../identity/index.ts";
import {
  addMessage,
  type Conversation,
  createConversation,
  recentMessages,
  setSummary,
  titleFrom,
  touchConversation,
  truncateFrom,
} from "./history.ts";
import type { AiMessageMeta } from "./schema.ts";
import { buildSystemPrompt } from "./service.ts";
import type { Skill } from "./skills/index.ts";
import { executeTool } from "./tools/execute.ts";
import { toolSpec, toolsFor } from "./tools/index.ts";
import { type ChatInput, MAX_CONTEXT_TURNS, MAX_TURNS } from "./validation.ts";

/** What `POST /ai/chat` streams, one server-sent event each (see docs/ai.md). */
export type ChatEvent =
  | { event: "conversation"; data: { id: string; title: string; userMessageId?: string } }
  | { event: "tool"; data: { name: string; status: "running" | "done" | "error" } }
  | { event: "delta"; data: { text: string } }
  | {
      event: "done";
      data: { remaining: number; conversationId?: string; userMessageId?: string; assistantMessageId?: string };
    };

export type ChatRun = {
  ctx: AppContext;
  actor: Actor;
  input: ChatInput;
  skill?: Skill;
  /** The stored conversation this question continues; the route already checked ownership. */
  conversation?: Conversation;
  remaining: number;
  signal: AbortSignal;
};

const SUMMARY_MAX_CHARS = 800;

async function updateSummary(ctx: AppContext, previous: string | null, question: string, answer: string) {
  try {
    const text = await ctx.ai.complete({
      messages: [
        {
          role: "system",
          content:
            "Keep a running summary of a chat between a user and an assistant. Update it with the newest exchange in at most 80 words. Keep facts, names, figures and decisions. Reply with the summary only.",
        },
        {
          role: "user",
          content: `Summary so far: ${previous || "(none)"}\n\nUser: ${question}\n\nAssistant: ${answer}`,
        },
      ],
      maxTokens: 160,
    });
    return text.trim().slice(0, SUMMARY_MAX_CHARS) || previous;
  } catch {
    // A failed summary must never fail the answer the user already has.
    ctx.logger.error({ event: "ai.summary_failed", driver: ctx.ai.driver });
    return previous;
  }
}

/** Splits a finished text into word-sized deltas so a reused planning answer still reads as chunks. */
function* chunks(text: string): Generator<string> {
  for (const part of text.split(/(?<= )/)) yield part;
}

/**
 * One question, end to end: history, optional tool planning, the streamed answer and persistence.
 * Errors propagate to the route, which turns them into an `error` event. Message content is never
 * logged.
 */
export async function* runChat(run: ChatRun): AsyncGenerator<ChatEvent> {
  const { ctx, actor, input, skill, signal } = run;
  const mode = ctx.env.AI_HISTORY;
  const question = input.messages.at(-1)?.content ?? "";

  let conversation = run.conversation;
  let userMessageId: string | undefined;
  let context: AiMessage[];

  if (mode !== "off" && !conversation) {
    conversation = await createConversation(ctx.db, actor.userId, titleFrom(question));
  }

  if (mode === "full" && conversation) {
    if (input.replaceFrom) await truncateFrom(ctx.db, conversation.id, input.replaceFrom);
    const prior = await recentMessages(ctx.db, conversation.id, MAX_CONTEXT_TURNS);
    context = prior.map((message) => ({ role: message.role, content: message.content }));
    context.push({ role: "user", content: question });
    userMessageId = await addMessage(ctx.db, {
      conversationId: conversation.id,
      role: "user",
      content: question,
      meta: skill ? { skill: skill.key } : null,
    });
  } else {
    context = input.messages.slice(-MAX_TURNS).map(({ role, content }) => ({ role, content }));
  }

  if (conversation) {
    yield { event: "conversation", data: { id: conversation.id, title: conversation.title, userMessageId } };
  }

  // Summary mode keeps no turns, so a conversation resumed with a fresh transcript gets its summary back.
  const resumeSummary =
    mode === "summary" && conversation && input.messages.length === 1 ? (conversation.summary ?? null) : null;

  const offered =
    ctx.env.AI_TOOLS_ENABLED && ctx.env.AI_MAX_TOOL_CALLS > 0 && ctx.ai.plan && !skill ? toolsFor(actor) : [];
  const toolMeta: NonNullable<AiMessageMeta["tools"]> = [];
  const toolResults: string[] = [];
  let answer = "";
  let reused = false;

  if (offered.length > 0 && ctx.ai.plan) {
    const system = buildSystemPrompt(ctx.env, actor, { summary: resumeSummary, toolsOffered: true });
    try {
      const plan = await ctx.ai.plan({
        messages: [{ role: "system", content: system }, ...context],
        tools: offered.map(toolSpec),
        signal,
      });
      if (plan.toolCalls.length === 0 && plan.text.trim() !== "") {
        reused = true;
        for (const text of chunks(plan.text)) {
          answer += text;
          yield { event: "delta", data: { text } };
        }
      }
      for (const call of plan.toolCalls.slice(0, ctx.env.AI_MAX_TOOL_CALLS)) {
        const tool = offered.find((candidate) => candidate.name === call.name);
        if (!tool) {
          yield { event: "tool", data: { name: call.name.slice(0, 64), status: "error" } };
          continue;
        }
        yield { event: "tool", data: { name: tool.name, status: "running" } };
        const outcome = await executeTool(ctx, actor, tool, call.arguments);
        toolMeta.push({ name: tool.name, status: outcome.status });
        toolResults.push(`${tool.name}: ${outcome.content}`);
        yield { event: "tool", data: { name: tool.name, status: outcome.status } };
      }
    } catch (error) {
      if (signal.aborted) return;
      // Tool planning is an optimisation: fall back to a plain answer rather than failing the question.
      ctx.logger.error({ event: "ai.plan_failed", driver: ctx.ai.driver, error: String(error) });
    }
  }

  const meta: AiMessageMeta | null =
    skill || toolMeta.length > 0
      ? { ...(skill ? { skill: skill.key } : {}), ...(toolMeta.length ? { tools: toolMeta } : {}) }
      : null;
  let assistantMessageId: string | undefined;
  const save = async () => {
    if (mode === "full" && conversation && answer.trim() !== "" && !assistantMessageId) {
      assistantMessageId = await addMessage(ctx.db, {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        meta,
      });
      await touchConversation(ctx.db, conversation.id);
    }
  };

  try {
    if (!reused) {
      const system = buildSystemPrompt(ctx.env, actor, {
        skill,
        summary: resumeSummary,
        toolResults,
        toolsOffered: offered.length > 0,
      });
      for await (const text of ctx.ai.stream({ messages: [{ role: "system", content: system }, ...context], signal })) {
        answer += text;
        yield { event: "delta", data: { text } };
      }
    }
    await save();
    if (mode === "summary" && conversation && answer.trim() !== "") {
      const summary = await updateSummary(ctx, conversation.summary, question, answer);
      if (summary) await setSummary(ctx.db, conversation.id, summary);
    }
  } finally {
    // A stopped answer keeps its partial text, so the turn is not lost on reload.
    if (signal.aborted) await save().catch(() => {});
  }

  yield {
    event: "done",
    data: { remaining: run.remaining, conversationId: conversation?.id, userMessageId, assistantMessageId },
  };
}
