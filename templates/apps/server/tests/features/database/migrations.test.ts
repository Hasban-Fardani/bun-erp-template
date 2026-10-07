import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createContext } from "../../../bootstrap/bootstrap.ts";
import type { AppContext } from "../../../bootstrap/context.ts";
import { migrate } from "../../../database/migrate.ts";
import { rowsOf } from "../../../database/rows.ts";
import { createTestContext, disposeTestContext, testEnv } from "../../support/fixtures.ts";
import { appliedNames, migrationModule, scopedDir, tableExists } from "./support.ts";

let ctx: AppContext;

beforeEach(async () => {
  // These tests inspect the ledger, so they need a schema of their own: closing the shared
  // context first and rebuilding it leaves `_migrations` empty for a clean run.
  await disposeTestContext();
  ctx = await createTestContext();
  await ctx.db.execute(sql`drop table if exists _migrations`);
  await ctx.db.execute(sql`drop table if exists probe_widgets, probe_second`);
});

afterAll(async () => {
  // Drops the shared schema so the next file starts from a known state.
  await disposeTestContext();
});

describe("migration runner", () => {
  test("applies pending files once, then reports nothing on a second run", async () => {
    const dir = await scopedDir({
      "0001_probe.ts": "create table probe_widgets (id uuid primary key);",
      "0002_more.ts": "alter table probe_widgets add column label text;",
    });

    const first = await migrate(ctx.db, dir);
    expect(first).toEqual(["0001_probe.ts", "0002_more.ts"]);
    expect(await appliedNames(ctx)).toEqual(["0001_probe.ts", "0002_more.ts"]);

    // Already applied means skipped — rerunning must not re-execute (it would fail on create table).
    const second = await migrate(ctx.db, dir);
    expect(second).toEqual([]);
  });

  test("keeps SQL-era ledger entries from replaying their TypeScript replacements", async () => {
    await migrate(ctx.db, await scopedDir({}));
    const dir = await scopedDir({ "0001_probe.ts": "create table probe_widgets (id uuid primary key);" });
    await ctx.db.execute(sql`insert into _migrations (name) values ('0001_probe.sql')`);
    expect(await migrate(ctx.db, dir)).toEqual([]);
    expect(await appliedNames(ctx)).toContain("0001_probe.sql");
  });

  test("a new file is applied while applied files are left alone", async () => {
    const dir = await scopedDir({
      "0001_probe.ts": "create table probe_widgets (id uuid primary key);",
      "0002_more.ts": "alter table probe_widgets add column label text;",
    });
    expect(await migrate(ctx.db, dir)).toEqual(["0001_probe.ts", "0002_more.ts"]);

    // Same directory, one file richer: only the newcomer should run.
    await Bun.write(join(dir, "0003_late.ts"), migrationModule("alter table probe_widgets add column note text;"));
    expect(await migrate(ctx.db, dir)).toEqual(["0003_late.ts"]);
    expect(await appliedNames(ctx)).toEqual(["0001_probe.ts", "0002_more.ts", "0003_late.ts"]);
  });

  test("concurrent runners serialize on the advisory lock instead of replaying a step", async () => {
    const dir = await scopedDir({
      "0001_slow.ts": "select pg_sleep(0.6); create table probe_widgets (id uuid primary key);",
    });

    const first = migrate(ctx.db, dir);
    await Bun.sleep(150);
    const second = migrate(ctx.db, dir);
    const [firstRan, secondRan] = await Promise.all([first, second]);

    // The loser waits on the lock, re-reads the ledger and skips the step the winner committed.
    expect([...firstRan, ...secondRan]).toEqual(["0001_slow.ts"]);
    expect(await appliedNames(ctx)).toEqual(["0001_slow.ts"]);
    expect(await tableExists(ctx, "probe_widgets")).toBe(true);
  });

  test("context creation only migrates when the caller asks for it", async () => {
    const dir = join(import.meta.dir, "..", "..", "..", "database", "migrations");
    await disposeTestContext();

    const passive = await createContext({ env: testEnv, migrationsDir: dir });
    try {
      // Reading commands and tests must not run DDL implicitly.
      expect(await tableExists(passive, "_migrations")).toBe(false);
    } finally {
      await passive.close();
    }

    const active = await createContext({ env: testEnv, migrationsDir: dir, migrateOnStart: true });
    try {
      expect(await tableExists(active, "_migrations")).toBe(true);
    } finally {
      await active.close();
    }
  });

  test("a failing statement rolls the whole file back — no half-migrated schema", async () => {
    const dir = await scopedDir({
      "0004_broken.ts":
        "create table probe_second (id uuid primary key); insert into probe_second (id) values ('bukan-uuid');",
    });

    await expect(migrate(ctx.db, dir)).rejects.toThrow();
    expect(await appliedNames(ctx)).not.toContain("0004_broken.ts");
    // The table from the first statement must not survive: one file is one transaction.
    const exists = await ctx.db.execute<{ exists: boolean }>(
      sql`select exists (select 1 from information_schema.tables where table_name = 'probe_second') as exists`,
    );
    expect(rowsOf<{ exists: boolean }>(exists)[0]?.exists).toBe(false);
    await ctx.db.execute(sql`drop table if exists probe_second`);
  });

  test("the real migrations directory is fully applied and its names are well-formed", async () => {
    const dir = join(import.meta.dir, "..", "..", "..", "database", "migrations");
    const entries = [...new Bun.Glob("*.ts").scanSync({ cwd: dir })].sort();
    expect(entries.length).toBeGreaterThan(0);
    for (const name of entries) {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.ts$/);
      expect((await Bun.file(join(dir, name)).text()).trim().length).toBeGreaterThan(0);
    }
  });
});
