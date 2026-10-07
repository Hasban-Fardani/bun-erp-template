import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecksParallel } from "@cli/gates/parallel-gates.ts";

test("independent checks all finish and preserve failure output", async () => {
  const completed: string[] = [];
  const results = await runChecksParallel(
    import.meta.dir,
    [
      { name: "missing", argv: ["/nonexistent-template-check-fixture"] },
      { name: "failure", argv: ["bun", "-e", 'console.error("failure detail"); process.exit(2)'] },
      { name: "success", argv: ["bun", "-e", 'await Bun.sleep(20); console.log("other check finished")'] },
    ],
    { concurrency: 2, onResult: (result) => completed.push(result.name) },
  );
  expect(results.map(({ name, ok }) => ({ name, ok }))).toEqual([
    { name: "missing", ok: false },
    { name: "failure", ok: false },
    { name: "success", ok: true },
  ]);
  expect(results[0]?.output).toContain("nonexistent-template-check-fixture");
  expect(results[1]?.output).toContain("failure detail");
  expect(results[2]?.output).toContain("other check finished");
  expect(completed.toSorted()).toEqual(["failure", "missing", "success"]);
});

test("an in-process gate job reports findings without spawning a CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "check-runner-gate-"));
  try {
    const migrations = join(root, "apps/server/database/migrations");
    await mkdir(migrations, { recursive: true });
    await Bun.write(join(migrations, "0001_create_users.ts"), "");
    await Bun.write(join(migrations, "bad-name.ts"), "");
    const results = await runChecksParallel(root, [{ name: "migrations", gate: "migrations" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.output).toContain("NNNN_snake_case.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a passing in-process gate stays silent", async () => {
  const root = await mkdtemp(join(tmpdir(), "check-runner-clean-"));
  try {
    const results = await runChecksParallel(root, [{ name: "migrations", gate: "migrations" }]);
    expect(results[0]).toMatchObject({ name: "migrations", ok: true, output: "" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
