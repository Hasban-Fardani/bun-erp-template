import { readOpenAiDeltas } from "../sse.ts";
import type { AiRequest, AiToolCall, AiToolPlan, AiToolRequest, FetchLike } from "../types.ts";

export type OpenAiCompatibleConfig = {
  /** Base URL up to and including the version segment, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  fetch: FetchLike;
};

const endpoint = (config: OpenAiCompatibleConfig) => `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
const headers = (config: OpenAiCompatibleConfig) => ({
  authorization: `Bearer ${config.apiKey}`,
  "content-type": "application/json",
});

async function providerError(response: Response): Promise<Error> {
  // The body names the provider's reason (quota, model); it is logged, never sent to the browser.
  const reason = (await response.text().catch(() => "")).slice(0, 300);
  return new Error(`AI provider answered ${response.status}: ${reason}`);
}

/** POSTs one chat completion; `extra` carries `stream` or `tools`. Throws on a provider error. */
async function postChat(config: OpenAiCompatibleConfig, request: AiRequest, extra: Record<string, unknown>) {
  const response = await config.fetch(endpoint(config), {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? config.maxTokens,
      ...extra,
    }),
    signal: request.signal,
  });
  if (!response.ok || !response.body) throw await providerError(response);
  return response;
}

/** Streams `POST <baseUrl>/chat/completions`: OpenAI, Groq, OpenRouter, Ollama, Workers AI REST. */
export async function* streamOpenAiCompatible(config: OpenAiCompatibleConfig, request: AiRequest) {
  const response = await postChat(config, request, { stream: true });
  yield* readOpenAiDeltas(response.body as ReadableStream<Uint8Array>);
}

/** Parses tool arguments that arrive as a JSON string (OpenAI) or already as an object. */
export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type RawToolCall = {
  id?: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
};

/** Accepts both the OpenAI shape (`function: { name, arguments }`) and Workers AI's flat shape. */
export function toToolCalls(raw: unknown): AiToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: AiToolCall[] = [];
  for (const [index, item] of (raw as RawToolCall[]).entries()) {
    const name = item.function?.name ?? item.name;
    if (!name) continue;
    calls.push({
      id: item.id || `call-${index + 1}`,
      name,
      arguments: parseToolArguments(item.function?.arguments ?? item.arguments),
    });
  }
  return calls;
}

/**
 * One non-streaming `POST <baseUrl>/chat/completions` with `tools`; returns the model's text and any
 * tool calls. The server executes the calls and streams the final answer separately.
 */
export async function planOpenAiCompatible(
  config: OpenAiCompatibleConfig,
  request: AiToolRequest,
): Promise<AiToolPlan> {
  const response = await postChat(config, request, {
    tools: request.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    tool_choice: "auto",
  });
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: unknown } }[];
  };
  const message = body.choices?.[0]?.message;
  return { text: message?.content ?? "", toolCalls: toToolCalls(message?.tool_calls) };
}
