export type AiRole = "system" | "user" | "assistant";

export type AiMessage = { role: AiRole; content: string };

export type AiRequest = {
  messages: readonly AiMessage[];
  /** Upper bound on answer length; the driver's configured default applies when omitted. */
  maxTokens?: number;
  signal?: AbortSignal;
};

/** JSON Schema object describing a tool's arguments. */
export type AiJsonSchema = Record<string, unknown>;

/** A function the model may ask the server to run (docs/ai.md, "Tools"). */
export type AiToolSpec = { name: string; description: string; parameters: AiJsonSchema };

export type AiToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type AiToolRequest = AiRequest & { tools: readonly AiToolSpec[] };

/** One non-streaming planning step: the model's text, tool calls, or (rarely) both. */
export type AiToolPlan = { text: string; toolCalls: AiToolCall[] };

export type AiDriverName = "workers-ai" | "openai" | "fake" | "off";

/**
 * The text-generation seam. Features call this, never a provider SDK, so the same code runs on the
 * Workers AI binding, the Workers AI REST endpoint or any OpenAI-compatible provider (docs/ai.md).
 */
export type Ai = {
  driver: AiDriverName;
  model: string;
  /** False when the driver has no binding or credentials; callers answer 503 instead of trying. */
  available: boolean;
  stream(request: AiRequest): AsyncIterable<string>;
  complete(request: AiRequest): Promise<string>;
  /**
   * Asks a function-calling model which tools to run. Optional so a driver (or a test double) without
   * tool support stays valid; the chat flow then streams a plain answer.
   */
  plan?(request: AiToolRequest): Promise<AiToolPlan>;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
