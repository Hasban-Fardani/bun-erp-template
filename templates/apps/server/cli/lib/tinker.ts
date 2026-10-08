import * as orm from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AppContext } from "../../bootstrap/context.ts";
import * as schema from "../../database/schema.ts";

/** Everything `bun erp tinker` preloads. The names are the contract documented in docs/development.md. */
const SCOPE_NAMES = ["db", "schema", "env", "sql", "orm", "ctx", "vars"] as const;

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

/**
 * Tinker is an operator tool that runs code typed by the operator against the real database, so it
 * is refused where a typo does damage unless the operator says `--force`.
 */
export function assertTinkerAllowed(input: {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  force: boolean;
}): void {
  if (input.force) return;
  if (input.nodeEnv === "production" || input.appEnv === "production") {
    throw new Error("Refusing to start tinker in production. Pass --force if you really mean to run code against it.");
  }
}

/**
 * Evaluates one input with `db`, `schema`, `env`, `sql`, `orm`, `ctx` and a persistent `vars`
 * object in scope. A single expression returns its value (top-level `await` works); anything that
 * is not an expression runs as a function body, so `const a = 1; return a` also works.
 */
export async function evaluateTinker(source: string, ctx: AppContext, vars: Record<string, unknown>): Promise<unknown> {
  const values = [ctx.db, schema, ctx.env, sql, orm, ctx, vars];
  try {
    return await new AsyncFunction(...SCOPE_NAMES, `return (\n${source}\n);`)(...values);
  } catch (error) {
    // Only a parse failure of the expression form falls back; a thrown error from running it must not rerun.
    if (!(error instanceof SyntaxError)) throw error;
  }
  return new AsyncFunction(...SCOPE_NAMES, source)(...values);
}

export function formatTinkerResult(value: unknown): string {
  return Bun.inspect(value, { depth: 4, colors: false });
}
