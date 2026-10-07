import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { migrate } from "../../../database/migrate.ts";
import { createTestContext, disposeTestContext } from "../../support/fixtures.ts";
import { scopedDir, tableExists } from "./support.ts";

let ctx: AppContext;

beforeEach(async () => {
  // The ledger is the subject here, so each case builds its own `_migrations` from scratch.
  await disposeTestContext();
  ctx = await createTestContext();
  await ctx.db.execute(sql`drop table if exists _migrations`);
  await ctx.db.execute(sql`drop table if exists probe_widgets`);
  await ctx.db.execute(sql`drop table if exists probe_second`);
});

afterAll(async () => {
  await disposeTestContext();
});

/** Runs a migration directory that must fail, and returns the thrown error. */
async function rejectionOf(dir: string): Promise<Error> {
  return (await migrate(ctx.db, dir).catch((error: unknown) => error)) as Error;
}

function expectRejection(failure: Error, name: string, ...files: string[]): void {
  expect(failure).toBeInstanceOf(Error);
  expect(failure.name).toBe(name);
  for (const file of files) expect(failure.message).toContain(file);
}

describe("migration ledger integrity", () => {
  test("a ledger entry with another stem under the same number is rejected, naming both files", async () => {
    await migrate(ctx.db, await scopedDir({}));
    await ctx.db.execute(sql`insert into _migrations (name) values ('0003_auth.sql')`);

    const dir = await scopedDir({ "0003_rbac.ts": "create table probe_widgets (id uuid primary key);" });
    const failure = await rejectionOf(dir);
    expectRejection(failure, "MigrationLedgerMismatch", "0003_auth.sql", "0003_rbac.ts");
    // The mismatched file must not run: the schema it builds belongs to a different catalog.
    expect(await tableExists(ctx, "probe_widgets")).toBe(false);
  });

  test("two catalog files sharing a number are rejected before anything runs", async () => {
    // Independent bodies on purpose: the rejection must not depend on which file sorts first.
    const dir = await scopedDir({
      "0008_scheduler.ts": "create table probe_widgets (id uuid primary key);",
      "0008_import_export.ts": "create table probe_second (id uuid primary key);",
    });
    const failure = await rejectionOf(dir);
    expectRejection(failure, "DuplicateMigrationNumber", "0008_scheduler.ts", "0008_import_export.ts");
    // Nothing ran: not even the ledger table was created.
    expect(await tableExists(ctx, "_migrations")).toBe(false);
    expect(await tableExists(ctx, "probe_widgets")).toBe(false);
    expect(await tableExists(ctx, "probe_second")).toBe(false);
  });
});
