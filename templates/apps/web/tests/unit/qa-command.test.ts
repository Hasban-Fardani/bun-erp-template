import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { helpSections } from "@cli/lib/help.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { commandNames } from "@cli/registry.ts";

async function erp(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", "cli/index.ts", ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, QA_PASSWORD: "" },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

test("qa is owned by the web app, so it exists only while the web app is installed", async () => {
  expect(existsSync(resolve(repoRoot, "apps/web/cli/commands/qa.ts"))).toBe(true);
  expect(existsSync(resolve(repoRoot, "cli/commands/qa.ts"))).toBe(false);
  const available = new Set(await commandNames());
  expect(available.has("qa")).toBe(true);
  const listed = helpSections(available).flatMap(({ commands }) => commands.map(([name]) => name.split(" ")[0]));
  expect(listed).toContain("qa");
  expect(helpSections(new Set()).flatMap(({ commands }) => commands.map(([name]) => name))).not.toContain("qa");
});

test("bun erp qa --list names the suites without a browser", async () => {
  const { code, out } = await erp("qa", "--list");
  expect(code).toBe(0);
  expect(out).toContain("core");
  expect(out).toContain("login");
  expect(out).toContain("assistant");
});

test("bun erp qa --dry-run prints the plan and honours --only", async () => {
  const { code, out } = await erp("qa", "--dry-run", "--only=login");
  expect(code).toBe(0);
  expect(out).toContain("login (");
  expect(out).toContain("core (skip");
});

test("bun erp qa rejects an unknown suite and an unknown option", async () => {
  expect((await erp("qa", "--only=nope")).code).toBe(1);
  expect((await erp("qa", "--bogus")).code).toBe(1);
});
