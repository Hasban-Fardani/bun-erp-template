import type { Env } from "../../config/index.ts";
import { streamFake } from "./drivers/fake.ts";
import { streamOpenAiCompatible } from "./drivers/openai.ts";
import { isWorkersAiBinding, streamWorkersAiBinding, workersAiRestBaseUrl } from "./drivers/workers-ai.ts";
import type { Ai, AiRequest, FetchLike } from "./types.ts";

export type { Ai, AiMessage, AiRequest } from "./types.ts";

/** Fast, cheap Workers AI chat model; fits the Free plan's daily Neurons for a demo. */
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

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
) {
  return { driver, model, available, stream, complete: (request) => complete(stream(request)) } satisfies Ai;
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
      return build("fake", "fake", true, streamFake);
    case "openai": {
      const config = {
        baseUrl: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
        maxTokens,
        fetch: fetcher,
      };
      return build("openai", env.AI_MODEL, true, (request) => streamOpenAiCompatible(config, request));
    }
    case "workers-ai": {
      const model = env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
      const binding = options.bindings?.[env.AI_BINDING];
      if (isWorkersAiBinding(binding)) {
        return build("workers-ai", model, true, (request) =>
          streamWorkersAiBinding(binding, model, maxTokens, request),
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
      return build("workers-ai", model, true, (request) => streamOpenAiCompatible(config, request));
    }
  }
}
