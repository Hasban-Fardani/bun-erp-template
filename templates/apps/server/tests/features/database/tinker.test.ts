import { expect, test } from "bun:test";
import { assertTinkerAllowed, evaluateTinker, formatTinkerResult } from "@/cli/lib/tinker.ts";
import { createTestContext, testEnv } from "../../support/fixtures.ts";

async function scope() {
  const ctx = await createTestContext();
  return { ctx, vars: {} as Record<string, unknown> };
}

test("--eval evaluates an expression against the preloaded db, schema and env", async () => {
  const { ctx, vars } = await scope();
  expect(await evaluateTinker("1 + 1", ctx, vars)).toBe(2);
  expect(await evaluateTinker("env.APP_ENV", ctx, vars)).toBe("test");
  expect(await evaluateTinker("typeof schema.roles", ctx, vars)).toBe("object");
  const rows = (await evaluateTinker("await db.execute(sql`select 7 as seven`)", ctx, vars)) as { seven: number }[];
  expect(Number(rows[0]?.seven)).toBe(7);
});

test("statements run when the input is not a single expression and vars persist between calls", async () => {
  const { ctx, vars } = await scope();
  await evaluateTinker("vars.total = 40; vars.total + 2", ctx, vars);
  expect(await evaluateTinker("vars.total", ctx, vars)).toBe(40);
  expect(await evaluateTinker("const a = 2; return a * 3;", ctx, vars)).toBe(6);
});

test("a thrown error reaches the caller and a syntax error is reported as one", async () => {
  const { ctx, vars } = await scope();
  await expect(evaluateTinker("await Promise.reject(new Error('boom'))", ctx, vars)).rejects.toThrow("boom");
  await expect(evaluateTinker("1 +", ctx, vars)).rejects.toThrow();
});

test("results print as readable text", () => {
  expect(formatTinkerResult(undefined)).toBe("undefined");
  expect(formatTinkerResult({ a: [1, 2] })).toContain("a:");
  const result = Object.assign([{ one: 1 }], { columns: [{ name: "one" }], command: "SELECT" });
  expect(formatTinkerResult(result)).not.toContain("columns");
});

test("production is refused without --force", () => {
  expect(() => assertTinkerAllowed({ nodeEnv: "production", appEnv: "development", force: false })).toThrow(/--force/);
  expect(() => assertTinkerAllowed({ nodeEnv: "development", appEnv: "production", force: false })).toThrow(/--force/);
  expect(() => assertTinkerAllowed({ nodeEnv: "production", appEnv: "production", force: true })).not.toThrow();
  expect(() => assertTinkerAllowed({ nodeEnv: undefined, appEnv: "test", force: false })).not.toThrow();
});

/** The same environment the test process uses, so the child reaches the disposable database. */
function childEnv(extra: Record<string, string>): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    APP_ENV: "test",
    DATABASE_URL: testEnv.DATABASE_URL,
    DATABASE_SSL_MODE: "disable",
    BETTER_AUTH_SECRET: testEnv.BETTER_AUTH_SECRET,
    ...extra,
  };
}

async function runTinker(args: string[], extra: Record<string, string> = {}) {
  await createTestContext();
  const proc = Bun.spawn(["bun", "erp", "tinker", ...args], {
    cwd: `${import.meta.dir}/../../../../..`,
    env: childEnv(extra),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

test("bun erp tinker --eval prints the result and exits 0", async () => {
  const result = await runTinker(["--eval", "env.APP_ENV"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"test"');
});

test("bun erp tinker refuses NODE_ENV=production without --force", async () => {
  const result = await runTinker(["--eval", "1"], { NODE_ENV: "production" });
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("--force");
});
