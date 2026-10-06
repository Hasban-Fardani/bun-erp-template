import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { MIGRATIONS_DIR, SEEDERS_DIR } from "../../../../cli/lib/repo.ts";
import { listSeederFiles } from "../../../../cli/lib/scaffold.ts";
import { toSeederName } from "../../../../cli/lib/scaffolding.ts";
import { defineCommand } from "../../../../cli/registry.ts";
import type { Database } from "../../database/index.ts";
import { migrate, rowsOf } from "../../database/migrate.ts";
import { seed } from "../../database/seed.ts";
import { createCliContext } from "../lib/context.ts";

export const commands = [
  defineCommand("db:migrate", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const ran = await migrate(ctx.db, MIGRATIONS_DIR);
    process.stdout.write(ran.length === 0 ? "No pending migrations.\n" : `Applied: ${ran.join(", ")}\n`);
    await ctx.close();
  }),

  // Exit 1 when any migration is pending — CI uses it to force db:migrate before deploy.
  defineCommand("db:status", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const files = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })]
      .filter((file) => /^\d{4}_[a-z0-9_]+\.ts$/.test(file))
      .sort();
    // Same unwrapping as the runner: PGlite returns `{ rows }`, postgres-js an array.
    const rows = rowsOf<{ name: string }>(await ctx.db.execute(sql`select name from _migrations`));
    const appliedIds = new Set(rows.map((row) => row.name.match(/^(\d{4})_/)?.[1] ?? row.name));
    const pending = files.filter((file) => !appliedIds.has(file.slice(0, 4)));
    for (const f of files) {
      process.stdout.write(`  ${appliedIds.has(f.slice(0, 4)) ? "applied " : "PENDING"} ${f}\n`);
    }
    process.stdout.write(`\n${files.length - pending.length}/${files.length} applied, ${pending.length} pending\n`);
    await ctx.close();
    if (pending.length > 0) process.exitCode = 1;
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
