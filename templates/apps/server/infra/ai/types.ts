export type AiRole = "system" | "user" | "assistant";

export type AiMessage = { role: AiRole; content: string };

export type AiRequest = {
  messages: readonly AiMessage[];
  /** Upper bound on the answer length; the driver default applies when omitted. */
  maxTokens?: number;
  signal?: AbortSignal;
};

export type AiDriverName = "workers-ai" | "openai" | "fake" | "off";

/**
 * Text generation behind one interface, so a feature never knows whether the answer came from the
 * Workers AI binding, its REST endpoint or any OpenAI-compatible provider (docs/ai.md).
 */
export type Ai = {
  driver: AiDriverName;
  model: string;
  /** False when the driver has no binding or credentials; callers answer 503 instead of trying. */
  available: boolean;
  /** Answer text in arrival order. Throws when the provider fails, also after a partial answer. */
  stream(request: AiRequest): AsyncIterable<string>;
  complete(request: AiRequest): Promise<string>;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
