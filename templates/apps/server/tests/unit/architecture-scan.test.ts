import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { repoRoot } from "@cli/lib/repo.ts";

/** The scan runs in a child process: a stalled scanner is a synchronous loop no in-process timeout can break. */
async function spans(source: string): Promise<string | undefined> {
  const script = `import { stringLiteralSpans } from ${JSON.stringify(resolve(repoRoot, "cli/gates/architecture-guard.ts"))};
console.log(JSON.stringify(stringLiteralSpans(${JSON.stringify(source)}, false)));`;
  const proc = Bun.spawn(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(9), 4000);
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);
  return code === 0 ? out.trim() : undefined;
}

test("string spans survive a regular expression literal that contains a hash", async () => {
  const source = 'const t = text.replace(/^# Heading[ \\t]*$/m, "x"); const u = "../../../a";';
  const result = await spans(source);
  expect(result).toBeDefined();
  const found = JSON.parse(result ?? "[]") as Array<[number, number]>;
  expect(found.map(([start, end]) => source.slice(start, end))).toEqual(['"x"', '"../../../a"']);
}, 10_000);

test("string spans survive quotes inside a regular expression literal", async () => {
  const source = `const q = /["']#/g.test(s); const u = '../../../b';`;
  const result = await spans(source);
  expect(result).toBeDefined();
  const found = JSON.parse(result ?? "[]") as Array<[number, number]>;
  expect(found.map(([start, end]) => source.slice(start, end))).toEqual([`'../../../b'`]);
}, 10_000);
