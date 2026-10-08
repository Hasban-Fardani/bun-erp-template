import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRotatingLogStream } from "@/infra/observability/rotating-log.ts";

let dir: string;
let clock: Date;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "erp-log-"));
  clock = new Date("2026-10-08T10:00:00Z");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const open = (overrides: { maxBytes?: number; retentionDays?: number } = {}) =>
  createRotatingLogStream({
    path: join(dir, "app.log"),
    retentionDays: overrides.retentionDays ?? 3,
    maxBytes: overrides.maxBytes ?? 1_000_000,
    now: () => clock,
  });

const names = async () => (await readdir(dir)).sort();

test("writes to a file named for the current UTC day", async () => {
  const log = open();
  log.write('{"msg":"one"}\n');
  await log.end();
  expect(await names()).toEqual(["app-2026-10-08.log"]);
  expect(await Bun.file(join(dir, "app-2026-10-08.log")).text()).toBe('{"msg":"one"}\n');
});

test("rotates by size into numbered files without losing a line", async () => {
  const log = open({ maxBytes: 40 });
  const lines = Array.from({ length: 6 }, (_, i) => `{"n":${i},"pad":"xxxxxxxxxx"}\n`);
  for (const line of lines) {
    log.write(line);
    await log.flush();
  }
  await log.end();

  const files = await names();
  expect(files.length).toBeGreaterThan(1);
  expect(files).toContain("app-2026-10-08.log");
  expect(files).toContain("app-2026-10-08.1.log");
  const all = (await Promise.all(files.map((f) => Bun.file(join(dir, f)).text()))).join("");
  expect(all.split("\n").filter(Boolean).sort()).toEqual(lines.map((l) => l.trim()).sort());
  for (const file of files) expect(Bun.file(join(dir, file)).size).toBeLessThanOrEqual(40);
});

test("rotates by date and prunes files older than the retention window", async () => {
  for (const day of ["2026-10-01", "2026-10-04", "2026-10-06"]) {
    await writeFile(join(dir, `app-${day}.log`), "old\n");
  }
  await writeFile(join(dir, "app-2026-10-02.3.log"), "old numbered\n");
  await writeFile(join(dir, "unrelated.txt"), "keep\n");
  await writeFile(join(dir, "other-2026-09-01.log"), "keep\n");

  const log = open({ retentionDays: 3 });
  log.write("today\n");
  await log.flush();
  expect(await names()).toEqual(["app-2026-10-06.log", "app-2026-10-08.log", "other-2026-09-01.log", "unrelated.txt"]);

  clock = new Date("2026-10-09T00:00:01Z");
  log.write("tomorrow\n");
  await log.end();
  expect(await names()).toEqual(["app-2026-10-08.log", "app-2026-10-09.log", "other-2026-09-01.log", "unrelated.txt"]);
});

test("keeps appending to an existing file for the same day after a restart", async () => {
  const first = open();
  first.write("a\n");
  await first.end();
  const second = open();
  second.write("b\n");
  await second.end();
  expect(await Bun.file(join(dir, "app-2026-10-08.log")).text()).toBe("a\nb\n");
});
