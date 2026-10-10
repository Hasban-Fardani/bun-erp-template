import { parseCommandOptions } from "@cli/lib/options.ts";
import { defineCommand } from "@cli/registry.ts";
import { loadEnv } from "../../config/index.ts";
import { createCliContext } from "../lib/context.ts";
import { assertTinkerAllowed, evaluateTinker, formatTinkerResult } from "../lib/tinker.ts";

const HELP = [
  "Preloaded: db (Drizzle), schema (all tables), env (validated config), sql, orm (drizzle-orm),",
  "ctx (the app context), vars (an object that persists between lines).",
  "Examples: await db.select().from(schema.roles)   |   vars.n = 1   |   .exit",
].join("\n");

export const commands = [
  defineCommand("tinker", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"], values: ["eval"] });
    const env = loadEnv();
    assertTinkerAllowed({ nodeEnv: process.env.NODE_ENV, appEnv: env.APP_ENV, force: parsed.flags.has("force") });

    const ctx = await createCliContext({ env, migrateOnStart: false });
    const vars: Record<string, unknown> = {};
    try {
      const expression = parsed.values.get("eval");
      if (expression !== undefined) {
        process.stdout.write(`${formatTinkerResult(await evaluateTinker(expression, ctx, vars))}\n`);
        return;
      }

      process.stdout.write(`${HELP}\n`);
      process.stdout.write("loom> ");
      for await (const line of console) {
        const input = line.trim();
        if (input === ".exit" || input === ".quit") break;
        if (input === ".help") process.stdout.write(`${HELP}\n`);
        else if (input !== "") {
          try {
            process.stdout.write(`${formatTinkerResult(await evaluateTinker(input, ctx, vars))}\n`);
          } catch (error) {
            process.stdout.write(`${error instanceof Error ? error.message : String(error)}\n`);
          }
        }
        process.stdout.write("loom> ");
      }
    } finally {
      await ctx.close();
    }
  }),
];
