import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { AppContext } from "../context.ts";
import { migrate, rowsOf } from "../platform/database/migrate.ts";
import { createTestContext } from "./helpers.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx ??= await createTestContext();
  // `_migrations` persists across tests, so one test's "already applied" would silently
  // skip the next test's files. Reset the ledger; shared context keeps the real schema.
  await ctx.db.execute(sql`drop table if exists _migrations`);
  await ctx.db.execute(sql`drop table if exists probe_widgets, probe_second`);
});

afterAll(async () => {
  await ctx?.close();
});

/** Fresh directory per test: a migration run must be reproducible, not order-dependent. */
async function scopedDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "erp-migrations-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, "utf8");
  }
  return dir;
}

async function appliedNames(context: AppContext): Promise<string[]> {
  const result = await context.db.execute<{ name: string }>(sql`select name from _migrations`);
  return rowsOf<{ name: string }>(result)
    .map((row) => row.name)
    .sort();
}

describe("migration runner", () => {
  test("applies pending files once, then reports nothing on a second run", async () => {
    const dir = await scopedDir({
      "0001_probe.sql": "create table probe_widgets (id uuid primary key);",
      "0002_more.sql": "alter table probe_widgets add column label text;",
    });

    const first = await migrate(ctx.db, dir);
    expect(first).toEqual(["0001_probe.sql", "0002_more.sql"]);
    expect(await appliedNames(ctx)).toEqual(["0001_probe.sql", "0002_more.sql"]);

    // Already applied means skipped — rerunning must not re-execute (it would fail on create table).
    const second = await migrate(ctx.db, dir);
    expect(second).toEqual([]);
  });

  test("a new file is applied while applied files are left alone", async () => {
    const dir = await scopedDir({
      "0001_probe.sql": "create table probe_widgets (id uuid primary key);",
      "0002_more.sql": "alter table probe_widgets add column label text;",
    });
    expect(await migrate(ctx.db, dir)).toEqual(["0001_probe.sql", "0002_more.sql"]);

    // Same directory, one file richer: only the newcomer should run.
    await writeFile(join(dir, "0003_late.sql"), "alter table probe_widgets add column note text;", "utf8");
    expect(await migrate(ctx.db, dir)).toEqual(["0003_late.sql"]);
    expect(await appliedNames(ctx)).toEqual(["0001_probe.sql", "0002_more.sql", "0003_late.sql"]);
  });

  test("a failing statement rolls the whole file back — no half-migrated schema", async () => {
    const dir = await scopedDir({
      "0004_broken.sql":
        "create table probe_second (id uuid primary key); insert into probe_second (id) values ('bukan-uuid');",
    });

    await expect(migrate(ctx.db, dir)).rejects.toThrow();
    expect(await appliedNames(ctx)).not.toContain("0004_broken.sql");
    // The table from the first statement must not survive: one file is one transaction.
    const exists = await ctx.db.execute<{ exists: boolean }>(
      sql`select exists (select 1 from information_schema.tables where table_name = 'probe_second') as exists`,
    );
    expect(rowsOf<{ exists: boolean }>(exists)[0]?.exists).toBe(false);
    await ctx.db.execute(sql`drop table if exists probe_second`);
  });

  test("the real migrations directory is fully applied and its names are well-formed", async () => {
    const dir = join(import.meta.dir, "..", "migrations");
    const entries = [...new Bun.Glob("*.sql").scanSync({ cwd: dir })].sort();
    expect(entries.length).toBeGreaterThan(0);
    for (const name of entries) {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
      expect((await readFile(join(dir, name), "utf8")).trim().length).toBeGreaterThan(0);
    }
  });
});
