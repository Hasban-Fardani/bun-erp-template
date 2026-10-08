import type { Env } from "../../config/index.ts";
import { planFake, streamFake } from "./drivers/fake.ts";
import { planOpenAiCompatible, streamOpenAiCompatible } from "./drivers/openai.ts";
import {
  isWorkersAiBinding,
  planWorkersAiBinding,
  streamWorkersAiBinding,
  workersAiRestBaseUrl,
} from "./drivers/workers-ai.ts";
import type { Ai, AiRequest, AiToolRequest, FetchLike } from "./types.ts";

export type {
  Ai,
  AiMessage,
  AiRequest,
  AiToolCall,
  AiToolPlan,
  AiToolRequest,
  AiToolSpec,
} from "./types.ts";

/** Fast, cheap Workers AI chat model; fits the Free plan's daily Neurons for a demo. */
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

/**
 * Workers AI model used only for the tool-planning step: it is documented to support function calling
 * (the default chat model is not). Override it with `AI_TOOL_MODEL`.
 */
export const DEFAULT_WORKERS_AI_TOOL_MODEL = "@hf/nousresearch/hermes-2-pro-mistral-7b";

export type CreateAiOptions = {
  env: Env;
  /** Worker bindings; the Workers AI binding is read from `env.AI_BINDING`. */
  bindings?: Record<string, unknown>;
  fetch?: FetchLike;
};

async function complete(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

function build(
  driver: Ai["driver"],
  model: string,
  available: boolean,
  stream: (r: AiRequest) => AsyncIterable<string>,
  plan?: (r: AiToolRequest) => ReturnType<NonNullable<Ai["plan"]>>,
) {
  return {
    driver,
    model,
    available,
    stream,
    complete: (request) => complete(stream(request)),
    ...(plan ? { plan } : {}),
  } satisfies Ai;
}

function unavailable(driver: Ai["driver"], model: string): Ai {
  return build(driver, model, false, () => {
    throw new Error(`AI driver ${driver} is not configured`);
  });
}

/**
 * Picks the AI driver from `AI_DRIVER`. `workers-ai` uses the Worker binding on Cloudflare and the
 * same models over REST (`AI_ACCOUNT_ID` + `AI_API_KEY`) on Bun, so a VPS move keeps the provider;
 * `openai` speaks to any OpenAI-compatible base URL to leave Cloudflare entirely.
 */
export function createAi(options: CreateAiOptions): Ai {
  const { env } = options;
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const maxTokens = env.AI_MAX_TOKENS;

  switch (env.AI_DRIVER) {
    case "off":
      return unavailable("off", "");
    case "fake":
      return build("fake", "fake", true, streamFake, async (request) => planFake(request));
    case "openai": {
      const config = {
        baseUrl: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
        maxTokens,
        fetch: fetcher,
      };
      const toolConfig = { ...config, model: env.AI_TOOL_MODEL || env.AI_MODEL };
      return build(
        "openai",
        env.AI_MODEL,
        true,
        (request) => streamOpenAiCompatible(config, request),
        (request) => planOpenAiCompatible(toolConfig, request),
      );
    }
    case "workers-ai": {
      const model = env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
      const toolModel = env.AI_TOOL_MODEL || DEFAULT_WORKERS_AI_TOOL_MODEL;
      const binding = options.bindings?.[env.AI_BINDING];
      if (isWorkersAiBinding(binding)) {
        return build(
          "workers-ai",
          model,
          true,
          (request) => streamWorkersAiBinding(binding, model, maxTokens, request),
          (request) => planWorkersAiBinding(binding, toolModel, maxTokens, request),
        );
      }
      if (env.AI_ACCOUNT_ID === "" || env.AI_API_KEY === "") return unavailable("workers-ai", model);
      const config = {
        baseUrl: workersAiRestBaseUrl(env.AI_ACCOUNT_ID),
        apiKey: env.AI_API_KEY,
        model,
        maxTokens,
        fetch: fetcher,
      };
      const toolConfig = { ...config, model: toolModel };
      return build(
        "workers-ai",
        model,
        true,
        (request) => streamOpenAiCompatible(config, request),
        (request) => planOpenAiCompatible(toolConfig, request),
      );
    }
  }
}
