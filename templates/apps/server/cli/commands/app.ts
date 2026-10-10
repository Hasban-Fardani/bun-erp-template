import { resolve } from "node:path";
import { parseCommandOptions } from "@cli/lib/options.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { defineCommand } from "@cli/registry.ts";
import { sql } from "drizzle-orm";
import { loadEnv } from "../../config/index.ts";
import { roles } from "../../features/rbac/schema.ts";
import { createApp } from "../../http/app.ts";
import { setMaintenance } from "../../http/maintenance.ts";
import { cliActor, createCliContext } from "../lib/context.ts";

export const commands = [
  defineCommand("route:list", async () => {
    // Routes are read from the app as actually assembled — not a hardcoded list that can go stale.
    const ctx = await createCliContext({ migrateOnStart: false });
    const app = createApp(ctx);
    const routes = app.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method.padEnd(6)} ${r.path}`)
      .sort()
      .filter((r, i, all) => all.indexOf(r) === i);
    process.stdout.write(`${routes.join("\n")}\n`);
    await ctx.close();
  }),

  defineCommand("down", async (args) => {
    const { values } = parseCommandOptions(args, { values: ["message"] });
    const message = values.get("message")?.trim();
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      await setMaintenance(ctx.db, message ? { down: true, message } : { down: true }, cliActor());
      process.stdout.write(
        "Maintenance mode is ON: /api/v1/* answers 503 (health checks and bypass sessions excepted).\n",
      );
      process.stdout.write("Replicas pick it up within a few seconds. Run `bun loom up` to resume.\n");
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("up", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      await setMaintenance(ctx.db, { down: false }, cliActor());
      process.stdout.write("Maintenance mode is OFF: the API is serving requests again.\n");
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("doctor", async () => {
    const checks: [string, boolean, string][] = [];
    checks.push(["bun version pinned", Bun.version === "1.4.2", `running ${Bun.version}`]);
    const envFile = await Bun.file(resolve(repoRoot, ".env")).exists();
    checks.push([".env present", envFile, envFile ? "found" : "copy .env.example -> .env"]);
    try {
      const ctx = await createCliContext({ migrateOnStart: false });
      await ctx.db.execute(sql`select 1`);
      checks.push(["database reachable", true, loadEnv().DATABASE_DRIVER]);
      const roleRows = await ctx.db.select({ id: roles.id }).from(roles).limit(1);
      checks.push(["RBAC seeded", roleRows.length > 0, roleRows.length > 0 ? "ok" : "run: bun loom db:seed"]);
      await ctx.close();
    } catch (err) {
      checks.push(["database reachable", false, err instanceof Error ? err.message : String(err)]);
    }
    for (const [label, pass, detail] of checks) {
      process.stdout.write(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(24)} ${detail}\n`);
    }
    if (checks.some(([, pass]) => !pass)) process.exit(1);
  }),
];
