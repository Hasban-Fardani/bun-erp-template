import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "@/bootstrap/context.ts";
import { queryBudget } from "@/http/query-budget.ts";
import { createQueryMeter } from "@/infra/observability/query-meter.ts";

type Logged = Record<string, unknown>;

function harness(opts: { production: boolean; budget: number }) {
  const warnings: Logged[] = [];
  const queries = createQueryMeter();
  const ctx = {
    env: { isProduction: opts.production },
    logger: { warn: (f: Logged) => warnings.push(f) },
    queries,
  } as unknown as AppContext;
  const app = new Hono();
  app.use("*", queryBudget(ctx, { "GET /x": opts.budget }, 2));
  app.get("/x", (c) => {
    queries.record("select 1");
    queries.record("select 2");
    queries.record("select 3");
    return c.text("ok");
  });
  app.get("/unlisted", (c) => {
    queries.record("select 1");
    return c.text("ok");
  });
  return { app, warnings };
}

describe("query meter", () => {
  test("counts statements and keeps a bounded recent sample", () => {
    const m = createQueryMeter();
    m.record("select 1");
    expect(m.count()).toBe(1);
    for (let i = 0; i < 100; i++) m.record(`select ${i}`);
    expect(m.count()).toBe(101);
    expect(m.sample().length).toBeLessThanOrEqual(20);
  });
});

describe("query budget middleware", () => {
  test("outside production it reports the count in Server-Timing", async () => {
    const { app } = harness({ production: false, budget: 5 });
    const res = await app.request("/x");
    expect(res.headers.get("server-timing")).toBe('db;desc="3 queries"');
  });

  test("production never exposes the count", async () => {
    const { app } = harness({ production: true, budget: 5 });
    expect((await app.request("/x")).headers.get("server-timing")).toBeNull();
  });

  test("a route over its budget logs one anomaly without statement text", async () => {
    const { app, warnings } = harness({ production: true, budget: 2 });
    await app.request("/x");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ event: "http.query_budget_exceeded", route: "GET /x", queries: 3, budget: 2 });
    expect(JSON.stringify(warnings[0])).not.toContain("select");
  });

  test("a route within budget is silent, an unlisted route falls back to the default", async () => {
    const { app, warnings } = harness({ production: true, budget: 3 });
    await app.request("/x");
    await app.request("/unlisted");
    expect(warnings).toHaveLength(0);
  });
});
