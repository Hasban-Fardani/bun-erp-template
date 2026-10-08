import { describe, expect, test } from "bun:test";
import { loadEnv } from "@/config/index.ts";
import { createAi } from "@/infra/ai/index.ts";
import { readSseData } from "@/infra/ai/sse.ts";
import { testEnv } from "../support/fixtures.ts";
import { RAW_ENV_BASE } from "../support/raw-env.ts";

const question = { messages: [{ role: "user" as const, content: "Halo?" }] };

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(lines.join("\n"));
  // Split mid-line on purpose: a network chunk boundary never lines up with an SSE event.
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 7));
      controller.enqueue(bytes.slice(7));
      controller.close();
    },
  });
}

/** A fetch that records each request and answers with one OpenAI-style streamed delta. */
function openAiStub(content: string) {
  const requests: Request[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    const delta = JSON.stringify({ choices: [{ delta: { content } }] });
    return new Response(sse([`data: ${delta}`, "", "data: [DONE]", ""]));
  };
  return { requests, fetcher };
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

describe("SSE reader", () => {
  test("yields each data payload across chunk boundaries and stops at [DONE]", async () => {
    const payloads: string[] = [];
    for await (const data of readSseData(
      sse(['data: {"a":1}', "", 'data: {"a":2}', "", "data: [DONE]", "", "data: x"]),
    )) {
      payloads.push(data);
    }
    expect(payloads).toEqual(['{"a":1}', '{"a":2}']);
  });
});

describe("AI drivers", () => {
  test("workers-ai streams through the Worker binding when it is present", async () => {
    const calls: unknown[] = [];
    const binding = {
      run: async (model: string, input: unknown) => {
        calls.push({ model, input });
        return sse(['data: {"response":"Halo"}', "", 'data: {"response":" juga"}', "", "data: [DONE]", ""]);
      },
    };
    const ai = createAi({ env: { ...testEnv, AI_DRIVER: "workers-ai" }, bindings: { AI: binding } });
    expect(ai.available).toBe(true);
    expect(await collect(ai.stream(question))).toBe("Halo juga");
    expect(calls[0]).toMatchObject({ model: "@cf/meta/llama-3.1-8b-instruct-fast", input: { stream: true } });
  });

  test("workers-ai falls back to the REST endpoint off Cloudflare", async () => {
    const { requests, fetcher } = openAiStub("Siap");
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "workers-ai", AI_ACCOUNT_ID: "acc123", AI_API_KEY: "cf-token" },
      fetch: fetcher,
    });
    expect(await collect(ai.stream(question))).toBe("Siap");
    expect(requests[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1/chat/completions");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer cf-token");
    expect(await requests[0]?.json()).toMatchObject({ model: "@cf/meta/llama-3.1-8b-instruct-fast", stream: true });
  });

  test("workers-ai without a binding or REST credentials reports unavailable", () => {
    const ai = createAi({ env: { ...testEnv, AI_DRIVER: "workers-ai", AI_ACCOUNT_ID: "", AI_API_KEY: "" } });
    expect(ai.available).toBe(false);
  });

  test("openai talks to any OpenAI-compatible base URL", async () => {
    const { requests, fetcher } = openAiStub("Ok");
    const ai = createAi({
      env: {
        ...testEnv,
        AI_DRIVER: "openai",
        AI_BASE_URL: "http://localhost:11434/v1/",
        AI_API_KEY: "k",
        AI_MODEL: "llama3.2",
      },
      fetch: fetcher,
    });
    expect(await ai.complete(question)).toBe("Ok");
    expect(requests[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(await requests[0]?.json()).toMatchObject({ model: "llama3.2" });
  });

  test("a provider error surfaces as an exception, not as an empty answer", async () => {
    const fetcher = async () => new Response("quota exceeded", { status: 429 });
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "openai", AI_API_KEY: "k", AI_MODEL: "m" },
      fetch: fetcher,
    });
    expect(collect(ai.stream(question))).rejects.toThrow(/429/);
  });

  test("fake answers deterministically and off is unavailable", async () => {
    expect(await createAi({ env: { ...testEnv, AI_DRIVER: "fake" } }).complete(question)).toContain("Halo?");
    expect(createAi({ env: { ...testEnv, AI_DRIVER: "off" } }).available).toBe(false);
  });
});

describe("AI configuration", () => {
  const raw = (overrides: Record<string, string>) => loadEnv({ ...RAW_ENV_BASE, ...overrides });

  test("defaults to Workers AI with a daily limit", () => {
    const env = raw({});
    expect(env.AI_DRIVER).toBe("workers-ai");
    expect(env.AI_DAILY_LIMIT).toBeGreaterThan(0);
  });

  test("openai needs an API key and a model", () => {
    expect(() => raw({ AI_DRIVER: "openai", AI_MODEL: "gpt" })).toThrow(/AI_API_KEY/);
    expect(() => raw({ AI_DRIVER: "openai", AI_API_KEY: "k" })).toThrow(/AI_MODEL/);
  });

  test("Workers AI REST credentials come together", () => {
    expect(() => raw({ AI_ACCOUNT_ID: "acc" })).toThrow(/together/);
  });
});
