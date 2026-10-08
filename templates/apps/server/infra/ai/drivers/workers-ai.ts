import { readSseData } from "../sse.ts";
import type { AiRequest, AiToolPlan, AiToolRequest } from "../types.ts";
import { toToolCalls } from "./openai.ts";

/** The slice of the Workers AI binding (`env.AI`) this driver uses. */
export type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
};

export function isWorkersAiBinding(value: unknown): value is WorkersAiBinding {
  return typeof value === "object" && value !== null && typeof (value as WorkersAiBinding).run === "function";
}

/**
 * Streams through the Worker binding. With `stream: true` the binding returns an event stream whose
 * events carry `{ "response": "<text>" }` (Workers AI text generation docs, via Context7).
 */
export async function* streamWorkersAiBinding(
  binding: WorkersAiBinding,
  model: string,
  maxTokens: number,
  request: AiRequest,
) {
  const result = await binding.run(model, {
    messages: request.messages,
    max_tokens: request.maxTokens ?? maxTokens,
    stream: true,
  });
  if (!(result instanceof ReadableStream)) throw new Error("Workers AI returned no stream");
  for await (const data of readSseData(result as ReadableStream<Uint8Array>)) {
    const text = (JSON.parse(data) as { response?: string }).response;
    if (text) yield text;
  }
}

type BindingPlanResult = {
  response?: string | null;
  tool_calls?: unknown;
  choices?: { message?: { content?: string | null; tool_calls?: unknown } }[];
};

/**
 * One non-streaming planning call through the binding. Function-calling models take a flat tool list
 * (`{ name, description, parameters }`) and answer with `tool_calls: [{ name, arguments }]` next to
 * `response` (Workers AI function-calling docs, via Context7). Newer models may answer in the OpenAI
 * `choices[0].message` shape, so both are read.
 */
export async function planWorkersAiBinding(
  binding: WorkersAiBinding,
  model: string,
  maxTokens: number,
  request: AiToolRequest,
): Promise<AiToolPlan> {
  const result = (await binding.run(model, {
    messages: request.messages,
    max_tokens: request.maxTokens ?? maxTokens,
    tools: request.tools,
  })) as BindingPlanResult | null;
  const message = result?.choices?.[0]?.message;
  return {
    text: result?.response ?? message?.content ?? "",
    toolCalls: toToolCalls(result?.tool_calls ?? message?.tool_calls),
  };
}

/** Workers AI's OpenAI-compatible REST endpoint, used where no binding exists (Bun on a VPS). */
export function workersAiRestBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}
