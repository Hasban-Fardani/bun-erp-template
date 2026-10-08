import { beforeEach, describe, expect, test } from "bun:test";
import type { AppContext } from "@/bootstrap/context.ts";
import { createUser } from "@/features/identity/service.ts";
import { createApp } from "@/http/app.ts";
import { createAi } from "@/infra/ai/index.ts";
import { createSeededContext, createTestClient, dataOf, loginOwner, testEnv } from "../../support/fixtures.ts";

const ask = { json: { messages: [{ role: "user" as const, content: "Apa itu ERP?" }] } };

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

/** Splits an SSE body into `{ event, data }` records. */
async function events(response: {
  text(): Promise<string>;
}): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}") as Record<string, unknown>;
      return { event, data };
    });
}

async function ownerClient(context: AppContext) {
  const app = createApp(context);
  return createTestClient(app, await loginOwner(app, context.db));
}

describe("AI assistant", () => {
  test("status and chat need a session", async () => {
    const client = createTestClient(createApp(ctx));
    expect((await client.api.v1.ai.status.$get()).status).toBe(401);
    expect((await client.api.v1.ai.chat.$post(ask)).status).toBe(401);
  });

  test("a user without ai.use is refused", async () => {
    const app = createApp(ctx);
    await createUser(
      ctx.db,
      { name: "No Role", email: "norole@example.test", password: "sandi-yang-panjang" },
      { userId: null, traceId: "test", label: "test" },
    );
    const signIn = await ctx.auth.api.signInEmail({
      body: { email: "norole@example.test", password: "sandi-yang-panjang" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const client = createTestClient(app, cookie);
    expect((await client.api.v1.ai.chat.$post(ask)).status).toBe(403);
  });

  test("status reports the driver and today's remaining questions", async () => {
    const client = await ownerClient(ctx);
    const res = await client.api.v1.ai.status.$get();
    expect(res.status).toBe(200);
    expect(await dataOf<Record<string, unknown>>(Promise.resolve(res))).toEqual({
      available: true,
      driver: "fake",
      dailyLimit: testEnv.AI_DAILY_LIMIT,
      remaining: testEnv.AI_DAILY_LIMIT,
    });
  });

  test("chat streams the answer as SSE deltas and ends with done", async () => {
    const client = await ownerClient(ctx);
    const res = await client.api.v1.ai.chat.$post(ask);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const received = await events(res);
    const answer = received
      .filter((e) => e.event === "delta")
      .map((e) => e.data.text)
      .join("");
    expect(answer).toContain("Apa itu ERP?");
    expect(received.at(-1)).toEqual({ event: "done", data: { remaining: testEnv.AI_DAILY_LIMIT - 1 } });
  });

  test("the conversation must end with a user turn", async () => {
    const client = await ownerClient(ctx);
    const res = await client.api.v1.ai.chat.$post({
      json: { messages: [{ role: "assistant", content: "Halo" }] },
    });
    expect(res.status).toBe(422);
  });

  test("the daily limit answers 429 once it is used up", async () => {
    const client = await ownerClient({ ...ctx, env: { ...ctx.env, AI_DAILY_LIMIT: 1 } });
    expect((await client.api.v1.ai.chat.$post(ask)).status).toBe(200);
    const second = await client.api.v1.ai.chat.$post(ask);
    expect(second.status).toBe(429);
  });

  test("an unconfigured provider answers 503 before spending quota", async () => {
    const off = { ...ctx, ai: createAi({ env: { ...ctx.env, AI_DRIVER: "off" } }) };
    const client = await ownerClient(off);
    expect((await client.api.v1.ai.chat.$post(ask)).status).toBe(503);
    expect(await dataOf(client.api.v1.ai.status.$get())).toMatchObject({
      available: false,
      remaining: testEnv.AI_DAILY_LIMIT,
    });
  });

  test("a provider failure mid-answer ends the stream with an error event", async () => {
    const broken = {
      ...ctx,
      ai: {
        driver: "fake",
        model: "broken",
        available: true,
        async *stream() {
          yield "Sebagian";
          throw new Error("upstream reset");
        },
        complete: async () => "",
      },
    } satisfies AppContext;
    const client = await ownerClient(broken);
    const received = await events(await client.api.v1.ai.chat.$post(ask));
    expect(received[0]).toEqual({ event: "delta", data: { text: "Sebagian" } });
    expect(received.at(-1)?.event).toBe("error");
  });
});
