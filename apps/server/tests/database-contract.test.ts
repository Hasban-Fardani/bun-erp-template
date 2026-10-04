import { beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { rowsOf, splitStatements } from "../platform/database/migrate.ts";
import { createSeededApp, type SeededApp } from "./helpers.ts";

let fixture: SeededApp;
beforeEach(async () => {
  fixture = await createSeededApp();
}, 30_000);

test("UUIDv7 uses the RFC version, variant, timestamp and unique random payload", async () => {
  const result = await fixture.ctx.db.execute<{ id: string }>(
    sql`select uuidv7()::text as id from generate_series(1, 1000)`,
  );
  const ids = rowsOf<{ id: string }>(result).map((row) => row.id);
  expect(new Set(ids).size).toBe(1000);
  for (const id of ids) {
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    const timestamp = Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
    expect(Math.abs(Date.now() - timestamp)).toBeLessThan(10_000);
  }
});

test("audit rejects SQL update and delete even without going through a service", async () => {
  await expect(Promise.resolve(fixture.ctx.db.execute(sql`update audit_logs set event = 'changed'`))).rejects.toThrow();
  await expect(Promise.resolve(fixture.ctx.db.execute(sql`delete from audit_logs`))).rejects.toThrow();
});

test("migration splitting keeps function bodies, comments and quoted semicolons intact", () => {
  const statements = splitStatements("do $body$ begin perform 'x;y'; end $body$; -- ;\nselect 'a;b';");
  expect(statements).toHaveLength(2);
  expect(statements[0]).toContain("perform 'x;y';");
  expect(statements[1]).toContain("select 'a;b'");
});
