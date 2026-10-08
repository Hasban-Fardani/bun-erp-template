import { beforeEach, describe, expect, test } from "bun:test";
import type { AppContext } from "@/bootstrap/context.ts";
import { users } from "@/features/identity/index.ts";
import { notify } from "@/features/notifications/index.ts";
import { createApp } from "@/http/app.ts";
import { type Ai, createAi } from "@/infra/ai/index.ts";
import { events, recordingAi } from "../../support/ai.ts";
import { createSeededContext, createTestClient, dataOf, loginOwner } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

const scriptedAi = (plan: Parameters<typeof recordingAi>[1]) => recordingAi("Jawaban akhir.", plan);

async function ownerClient(context: AppContext) {
  const app = createApp(context);
  return createTestClient(app, await loginOwner(app, context.db));
}

const ask = (content: string, extra: Record<string, unknown> = {}) => ({
  json: { messages: [{ role: "user" as const, content }], ...extra },
});

describe("AI skills", () => {
  test("GET /ai/skills lists the skills the actor may use and needs a session", async () => {
    expect((await createTestClient(createApp(ctx)).api.v1.ai.skills.$get()).status).toBe(401);
    const client = await ownerClient(ctx);
    const list = await dataOf<{ key: string; title: string; description: string }[]>(client.api.v1.ai.skills.$get());
    expect(list.map((skill) => skill.key)).toEqual(["summarize", "write-email", "translate"]);
    expect(list[0]).toEqual({ key: "summarize", title: expect.any(String), description: expect.any(String) });
  });

  test("a chosen skill's instructions are appended to the server-owned system prompt", async () => {
    const { ai, seen } = scriptedAi(() => ({ text: "", toolCalls: [] }));
    const client = await ownerClient({ ...ctx, ai });
    await events(await client.api.v1.ai.chat.$post(ask("Halo dunia", { skill: "translate" })));
    const system = seen[0]?.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("Skill: Translate");
    expect(system).toContain(ctx.env.APP_NAME);
  });

  test("an unknown skill is a 422 and spends no question", async () => {
    const client = await ownerClient(ctx);
    expect((await client.api.v1.ai.chat.$post(ask("Halo", { skill: "does-not-exist" }))).status).toBe(422);
    expect(await dataOf<{ remaining: number }>(client.api.v1.ai.status.$get())).toMatchObject({
      remaining: ctx.env.AI_DAILY_LIMIT,
    });
  });
});

describe("AI tools", () => {
  test("the fake driver calls unread_notifications and the answer sees the result", async () => {
    const { ai, seen } = scriptedAi(() => ({ text: "", toolCalls: [] }));
    const planner = createAi({ env: ctx.env });
    const wired: Ai = { ...ai, plan: planner.plan };
    const client = await ownerClient({ ...ctx, ai: wired });
    const adminId = (await ctx.db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? "";
    await notify(ctx, { recipients: [adminId], type: "test.event", title: "Faktur jatuh tempo" });
    const received = await events(await client.api.v1.ai.chat.$post(ask("Berapa notifikasi saya?")));

    const tool = received.filter((e) => e.event === "tool").map((e) => e.data);
    expect(tool).toEqual([
      { name: "unread_notifications", status: "running" },
      { name: "unread_notifications", status: "done" },
    ]);
    const context =
      seen
        .at(-1)
        ?.map((m) => m.content)
        .join("\n") ?? "";
    expect(context).toContain("unread_notifications");
    expect(context).toContain("Faktur jatuh tempo");
    expect(received.at(-1)?.event).toBe("done");
  });

  test("only tools the actor may use are offered, and at most AI_MAX_TOOL_CALLS run", async () => {
    const { ai, planned } = scriptedAi(() => ({
      text: "",
      toolCalls: Array.from({ length: 5 }, (_, index) => ({
        id: `c${index}`,
        name: "unread_notifications",
        arguments: {},
      })),
    }));
    const client = await ownerClient({ ...ctx, ai, env: { ...ctx.env, AI_MAX_TOOL_CALLS: 2 } });
    const received = await events(await client.api.v1.ai.chat.$post(ask("Halo")));
    expect(planned[0]?.tools.map((tool) => tool.name)).toEqual(["unread_notifications", "find_users"]);
    expect(received.filter((e) => e.event === "tool" && e.data.status === "done")).toHaveLength(2);
  });

  test("find_users returns at most five rows with id, name and email only", async () => {
    const { ai, seen } = scriptedAi(() => ({
      text: "",
      toolCalls: [{ id: "c1", name: "find_users", arguments: { query: "example.test" } }],
    }));
    const app = createApp({ ...ctx, ai });
    const cookie = await loginOwner(app, ctx.db);
    const { createFixtureUser } = await import("../../support/fixtures.ts");
    for (let index = 0; index < 7; index += 1) await createFixtureUser(ctx.db, `orang${index}@example.test`);
    await events(await createTestClient(app, cookie).api.v1.ai.chat.$post(ask("cari user example")));
    const shown =
      seen
        .at(-1)
        ?.map((m) => m.content)
        .join("\n") ?? "";
    const json = /\{"users":\[.*\]\}/s.exec(shown)?.[0] ?? "";
    const parsed = JSON.parse(json) as { users: Record<string, unknown>[] };
    expect(parsed.users).toHaveLength(5);
    expect(Object.keys(parsed.users[0] ?? {}).sort()).toEqual(["email", "id", "name"]);
  });

  test("an unknown tool name becomes a tool error and the answer still completes", async () => {
    const { ai } = scriptedAi(() => ({ text: "", toolCalls: [{ id: "c1", name: "drop_tables", arguments: {} }] }));
    const client = await ownerClient({ ...ctx, ai });
    const received = await events(await client.api.v1.ai.chat.$post(ask("Halo")));
    expect(received.find((e) => e.event === "tool")?.data).toEqual({ name: "drop_tables", status: "error" });
    expect(received.at(-1)?.event).toBe("done");
  });

  test("a planning failure falls back to a plain streamed answer", async () => {
    const { ai, seen } = scriptedAi(() => {
      throw new Error("tool model down");
    });
    const client = await ownerClient({ ...ctx, ai });
    const received = await events(await client.api.v1.ai.chat.$post(ask("Halo")));
    expect(seen).toHaveLength(1);
    expect(received.at(-1)?.event).toBe("done");
  });

  test("a plain-text plan is the answer; no second generation happens", async () => {
    const { ai, seen } = scriptedAi(() => ({ text: "Langsung dijawab.", toolCalls: [] }));
    const client = await ownerClient({ ...ctx, ai });
    const received = await events(await client.api.v1.ai.chat.$post(ask("Halo")));
    expect(
      received
        .filter((e) => e.event === "delta")
        .map((e) => e.data.text)
        .join(""),
    ).toBe("Langsung dijawab.");
    expect(seen).toHaveLength(0);
  });

  test("AI_TOOLS_ENABLED=false never plans", async () => {
    const off = scriptedAi(() => ({ text: "", toolCalls: [] }));
    const client = await ownerClient({ ...ctx, ai: off.ai, env: { ...ctx.env, AI_TOOLS_ENABLED: false } });
    await events(await client.api.v1.ai.chat.$post(ask("Halo")));
    expect(off.planned).toHaveLength(0);
    expect(off.seen).toHaveLength(1);
  });

  test("a chosen skill skips tool planning", async () => {
    const skilled = scriptedAi(() => ({ text: "", toolCalls: [] }));
    const client = await ownerClient({ ...ctx, ai: skilled.ai });
    await events(await client.api.v1.ai.chat.$post(ask("Ringkas ini", { skill: "summarize" })));
    expect(skilled.planned).toHaveLength(0);
  });
});
