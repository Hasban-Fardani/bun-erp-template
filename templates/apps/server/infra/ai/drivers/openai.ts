import { readOpenAiDeltas } from "../sse.ts";
import type { AiRequest, FetchLike } from "../types.ts";

export type OpenAiCompatibleConfig = {
  /** Base URL up to and including the version segment, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  fetch: FetchLike;
};

/** Streams `POST <baseUrl>/chat/completions`: OpenAI, Groq, OpenRouter, Ollama, Workers AI REST. */
export async function* streamOpenAiCompatible(config: OpenAiCompatibleConfig, request: AiRequest) {
  const response = await config.fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? config.maxTokens,
      stream: true,
    }),
    signal: request.signal,
  });
  if (!response.ok || !response.body) {
    // The body names the provider's reason (quota, model); it is logged, never sent to the browser.
    const reason = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`AI provider answered ${response.status}: ${reason}`);
  }
  yield* readOpenAiDeltas(response.body);
}
