import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { parseCommandOptions } from "../../../../cli/lib/options.ts";
import { MIGRATIONS_DIR, SEEDERS_DIR } from "../../../../cli/lib/repo.ts";
import { listSeederFiles } from "../../../../cli/lib/scaffold.ts";
import { toSeederName } from "../../../../cli/lib/scaffolding.ts";
import { defineCommand } from "../../../../cli/registry.ts";
import { loadEnv } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { listMigrationFiles, migrate, planMigrations } from "../../database/migrate.ts";
import { rowsOf } from "../../database/rows.ts";
import { seed } from "../../database/seed.ts";
import { createCliContext } from "../lib/context.ts";

export const commands = [
  defineCommand("db:migrate", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const ran = await migrate(ctx.db, MIGRATIONS_DIR);
    process.stdout.write(ran.length === 0 ? "No pending migrations.\n" : `Applied: ${ran.join(", ")}\n`);
    await ctx.close();
  }),

  // Exit 1 when the ledger cannot be reconciled — CI uses it to force a fix before deploy.
  defineCommand("db:status", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const files = listMigrationFiles(MIGRATIONS_DIR);
      const plan = planMigrations(await readLedger(ctx.db), files);
      for (const file of plan.applied) process.stdout.write(`  applied  ${file}\n`);
      for (const { catalog, ledger } of plan.mismatches) {
        process.stdout.write(`  mismatch ${catalog} (ledger: ${ledger})\n`);
      }
      for (const file of plan.pending) process.stdout.write(`  pending  ${file}\n`);
      for (const { number, files: clash } of plan.duplicates) {
        process.stdout.write(`  duplicate ${number}: ${clash.join(", ")}\n`);
      }
      process.stdout.write(
        `\n${plan.applied.length}/${files.length} applied, ${plan.pending.length} pending, ${plan.mismatches.length} mismatch\n`,
      );
      if (plan.mismatches.length > 0) {
        process.stdout.write(
          "The schema is out of date with the catalog; run `bun erp db:reset --force` on local data.\n",
        );
      }
      if (plan.pending.length + plan.mismatches.length + plan.duplicates.length > 0) process.exitCode = 1;
    } finally {
      await ctx.close();
    }
  }),

  // Local recovery for a database built by an older catalog; production is refused outright.
  defineCommand("db:reset", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"] });
    const env = loadEnv();
    if (env.APP_ENV === "production") {
      process.stderr.write(
        "Refusing to reset the schema with APP_ENV=production. `bun erp db:reset` is for local and test databases.\n",
      );
      process.exit(1);
    }
    if (!parsed.flags.has("force")) {
      process.stderr.write("Refusing to drop and recreate the schema without --force. Run: bun erp db:reset --force\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ env, migrateOnStart: false });
    try {
      await ctx.db.execute(sql`drop schema public cascade`);
      await ctx.db.execute(sql`create schema public`);
      const ran = await migrate(ctx.db, MIGRATIONS_DIR);
      const seeded = await seed(ctx.db);
      process.stdout.write(
        `Reset schema "public": ${ran.length} migration(s) applied, ${seeded.permissions} permission(s) and ${seeded.roles} role(s) seeded.\n`,
      );
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("db:seed", async (args) => {
    const requestedSeeder = args[0] ? toSeederName(args[0]) : undefined;
    if (args.length > 1) {
      process.stderr.write("Usage: bun erp db:seed [seeder]\n");
      process.exit(1);
    }
    const seederFiles = listSeederFiles();
    if (requestedSeeder && !seederFiles.includes(`${requestedSeeder}.ts`)) {
      process.stderr.write(
        `Seeder not found: ${requestedSeeder}. Available: ${seederFiles.map((file) => file.slice(0, -3)).join(", ") || "none"}.\n`,
      );
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const result = await seed(ctx.db);
      process.stdout.write(`Seeded ${result.permissions} permission(s), ${result.roles} role(s).\n`);
      const selected = requestedSeeder ? [`${requestedSeeder}.ts`] : seederFiles;
      for (const file of selected) {
        const module = (await import(resolve(SEEDERS_DIR, file))) as { seed?: (database: Database) => Promise<void> };
        if (typeof module.seed !== "function") throw new Error(`Seeder ${file} must export seed(database)`);
        await module.seed(ctx.db);
        process.stdout.write(`Ran feature seeder: ${file}\n`);
      }
    } finally {
      await ctx.close();
    }
  }),
];

/** A missing ledger table means nothing has run yet; `to_regclass` avoids a 42P01 crash. */
async function readLedger(db: Database): Promise<string[]> {
  const ledgerTable = rowsOf<{ name: string | null }>(
    await db.execute(sql`select to_regclass('public._migrations') as name`),
  )[0]?.name;
  if (!ledgerTable) return [];
  return rowsOf<{ name: string }>(await db.execute(sql`select name from _migrations`)).map((row) => row.name);
}
