import { describe, expect, test } from "bun:test";
import * as z from "zod";
import { loadEnv } from "@/config/index.ts";
import { defineSkill } from "@/features/ai/skills/define.ts";
import { resolveSkill, skills, skillsFor } from "@/features/ai/skills/index.ts";
import { executeTool, MAX_TOOL_RESULT_CHARS } from "@/features/ai/tools/execute.ts";
import { defineTool, toolsFor } from "@/features/ai/tools/index.ts";
import type { Actor } from "@/features/identity/index.ts";
import type { AiToolSpec } from "@/infra/ai/index.ts";
import { createAi, DEFAULT_WORKERS_AI_TOOL_MODEL } from "@/infra/ai/index.ts";
import { testEnv } from "../support/fixtures.ts";
import { RAW_ENV_BASE } from "../support/raw-env.ts";

const stubContext = { logger: { error() {} } } as never;
const specs: AiToolSpec[] = [
  { name: "unread_notifications", description: "Unread count", parameters: { type: "object", properties: {} } },
];
const ask = [{ role: "user" as const, content: "Berapa notifikasi saya?" }];

const actor = (permissions: Actor["permissions"]): Actor => ({
  userId: "u1",
  permissions,
  traceId: "t",
  name: "Tester",
  email: "t@example.test",
  label: "t@example.test",
});

describe("tool planning per driver", () => {
  test("openai sends standard tools and parses tool_calls", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: "unread_notifications", arguments: "{}" } }],
            },
          },
        ],
      });
    };
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "openai", AI_API_KEY: "k", AI_MODEL: "gpt", AI_BASE_URL: "https://llm.test/v1" },
      fetch: fetcher,
    });
    const plan = await ai.plan?.({ messages: ask, tools: specs });
    expect(plan?.toolCalls).toEqual([{ id: "c1", name: "unread_notifications", arguments: {} }]);
    expect(requests[0]?.url).toBe("https://llm.test/v1/chat/completions");
    expect(requests[0]?.body.stream).toBeUndefined();
    expect(requests[0]?.body.tools).toEqual([
      {
        type: "function",
        function: { name: "unread_notifications", description: "Unread count", parameters: specs[0]?.parameters },
      },
    ]);
  });

  test("workers-ai binding plans with the function-calling model and flat tools", async () => {
    const calls: { model: string; input: Record<string, unknown> }[] = [];
    const binding = {
      async run(model: string, input: Record<string, unknown>) {
        calls.push({ model, input });
        return { response: null, tool_calls: [{ name: "find_users", arguments: { query: "budi" } }] };
      },
    };
    const ai = createAi({ env: { ...testEnv, AI_DRIVER: "workers-ai" }, bindings: { AI: binding } });
    const plan = await ai.plan?.({ messages: ask, tools: specs });
    expect(calls[0]?.model).toBe(DEFAULT_WORKERS_AI_TOOL_MODEL);
    const offered = (calls[0]?.input.tools ?? []) as { name: string }[];
    expect(offered[0]?.name).toBe("unread_notifications");
    expect(plan?.text).toBe("");
    expect(plan?.toolCalls[0]).toMatchObject({ name: "find_users", arguments: { query: "budi" } });
  });

  test("workers-ai binding honours AI_TOOL_MODEL and returns plain text when no tool is needed", async () => {
    const models: string[] = [];
    const binding = {
      async run(model: string) {
        models.push(model);
        return { response: "Halo!" };
      },
    };
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "workers-ai", AI_TOOL_MODEL: "@cf/custom/tools" },
      bindings: { AI: binding },
    });
    expect(await ai.plan?.({ messages: ask, tools: specs })).toEqual({ text: "Halo!", toolCalls: [] });
    expect(models).toEqual(["@cf/custom/tools"]);
  });

  test("workers-ai REST uses the OpenAI-compatible endpoint with the tool model", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: { content: "Tidak perlu alat." } }] });
    };
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "workers-ai", AI_ACCOUNT_ID: "acc", AI_API_KEY: "tok" },
      fetch: fetcher,
    });
    const plan = await ai.plan?.({ messages: ask, tools: specs });
    expect(bodies[0]?.model).toBe(DEFAULT_WORKERS_AI_TOOL_MODEL);
    expect(plan).toEqual({ text: "Tidak perlu alat.", toolCalls: [] });
  });

  test("fake is deterministic: a notification question calls unread_notifications", async () => {
    const ai = createAi({ env: testEnv });
    const plan = await ai.plan?.({ messages: ask, tools: specs });
    expect(plan?.toolCalls.map((call) => call.name)).toEqual(["unread_notifications"]);
    const none = await ai.plan?.({ messages: [{ role: "user", content: "Apa itu ERP?" }], tools: specs });
    expect(none?.toolCalls).toEqual([]);
  });

  test("a provider error while planning surfaces as an exception", async () => {
    const ai = createAi({
      env: { ...testEnv, AI_DRIVER: "openai", AI_API_KEY: "k", AI_MODEL: "gpt" },
      fetch: async () => new Response("quota", { status: 429 }),
    });
    await expect(ai.plan?.({ messages: ask, tools: specs })).rejects.toThrow(/429/);
  });
});

describe("tool registry", () => {
  const secret = defineTool({
    name: "secret_report",
    description: "Needs a permission",
    parameters: z.object({}),
    permission: "audit.read",
    run: async () => ({ ok: true }),
  });
  const open = defineTool({
    name: "open_tool",
    description: "No permission",
    parameters: z.object({ limit: z.number().int().max(5) }),
    run: async (_ctx, _actor, args) => ({ limit: args.limit }),
  });

  test("a tool is exposed only to actors holding its permission", () => {
    expect(toolsFor(actor(["ai.use"]), [secret, open]).map((tool) => tool.name)).toEqual(["open_tool"]);
    expect(toolsFor(actor(["ai.use", "audit.read"]), [secret, open]).map((tool) => tool.name)).toEqual([
      "secret_report",
      "open_tool",
    ]);
  });

  test("the shipped tools are read-only examples with the documented permissions", () => {
    const names = toolsFor(actor(["ai.use", "user.read"])).map((tool) => tool.name);
    expect(names).toEqual(["unread_notifications", "find_users"]);
    expect(toolsFor(actor(["ai.use"])).map((tool) => tool.name)).toEqual(["unread_notifications"]);
  });

  test("execution re-checks the permission, validates arguments and reports errors as short results", async () => {
    const ctx = {} as never;
    const denied = await executeTool(ctx, actor(["ai.use"]), secret, {});
    expect(denied.status).toBe("error");
    const invalid = await executeTool(ctx, actor(["ai.use"]), open, { limit: 99 });
    expect(invalid.status).toBe("error");
    expect(JSON.parse(invalid.content)).toHaveProperty("error");
    const fine = await executeTool(ctx, actor(["ai.use"]), open, { limit: 2 });
    expect(fine).toEqual({ status: "done", content: '{"limit":2}' });
  });

  test("a throwing tool becomes an error result and never leaks its message", async () => {
    const broken = defineTool({
      name: "broken",
      description: "Throws",
      parameters: z.object({}),
      run: async () => {
        throw new Error("connection string postgres://secret");
      },
    });
    const result = await executeTool(stubContext, actor(["ai.use"]), broken, {});
    expect(result.status).toBe("error");
    expect(result.content).not.toContain("secret");
  });

  test("a large result is truncated to a bounded JSON string", async () => {
    const big = defineTool({
      name: "big",
      description: "Large",
      parameters: z.object({}),
      run: async () => ({ rows: Array.from({ length: 500 }, (_, index) => ({ index, text: "x".repeat(20) })) }),
    });
    const result = await executeTool({} as never, actor(["ai.use"]), big, {});
    expect(result.status).toBe("done");
    expect(result.content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS + 40);
    expect(result.content).toContain("truncated");
  });
});

describe("skill registry", () => {
  test("ships summarize, write-email and translate", () => {
    expect(skills.map((skill) => skill.key)).toEqual(["summarize", "write-email", "translate"]);
    for (const skill of skills) expect(skill.instructions.length).toBeGreaterThan(20);
  });

  test("a skill with a permission is hidden and refused without it", () => {
    const gated = defineSkill({
      key: "audit-digest",
      title: "Audit digest",
      description: "Needs audit.read",
      instructions: "Summarize audit trails.",
      permission: "audit.read",
    });
    const list = [...skills, gated];
    expect(skillsFor(actor(["ai.use"]), list).map((skill) => skill.key)).not.toContain("audit-digest");
    expect(resolveSkill(actor(["ai.use"]), "audit-digest", list)).toEqual({ error: "forbidden" });
    expect(resolveSkill(actor(["ai.use"]), "nope", list)).toEqual({ error: "unknown" });
    expect(resolveSkill(actor(["ai.use", "audit.read"]), "audit-digest", list)).toEqual({ skill: gated });
  });
});

describe("tool and history configuration", () => {
  const raw = (overrides: Record<string, string>) => loadEnv({ ...RAW_ENV_BASE, ...overrides });

  test("defaults: full history, tools on, three tool calls", () => {
    const env = raw({});
    expect(env.AI_HISTORY).toBe("full");
    expect(env.AI_TOOLS_ENABLED).toBe(true);
    expect(env.AI_MAX_TOOL_CALLS).toBe(3);
    expect(env.AI_TOOL_MODEL).toBe("");
  });

  test("history must be full, summary or off; tool calls are bounded", () => {
    expect(raw({ AI_HISTORY: "summary" }).AI_HISTORY).toBe("summary");
    expect(() => raw({ AI_HISTORY: "forever" })).toThrow(/AI_HISTORY/);
    expect(() => raw({ AI_MAX_TOOL_CALLS: "50" })).toThrow(/AI_MAX_TOOL_CALLS/);
    expect(raw({ AI_TOOLS_ENABLED: "false" }).AI_TOOLS_ENABLED).toBe(false);
  });
});
