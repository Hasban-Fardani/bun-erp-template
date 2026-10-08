import { readSseData } from "../sse.ts";
import type { AiRequest } from "../types.ts";

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

/** Workers AI's OpenAI-compatible REST endpoint, used where no binding exists (Bun on a VPS). */
export function workersAiRestBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}
