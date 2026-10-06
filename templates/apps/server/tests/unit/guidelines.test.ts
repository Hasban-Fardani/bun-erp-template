import { expect, test } from "bun:test";
import {
  applyGuidelinesBlock,
  GUIDELINES_END,
  GUIDELINES_START,
  refreshGuidelines,
  renderGuidelinesBlock,
} from "../../../../cli/lib/guidelines.ts";
import { repoRoot } from "../../../../cli/lib/repo.ts";

test("the generated block lists installed apps, packages and features with guide paths", async () => {
  const block = await renderGuidelinesBlock(repoRoot);
  expect(block.startsWith(GUIDELINES_START)).toBe(true);
  expect(block.endsWith(GUIDELINES_END)).toBe(true);
  expect(block).toContain("`server`");
  expect(block).toContain("@bun-erp/server");
  expect(block).toContain("packages/ui/llms.txt");
  expect(block).toContain("templates/features/README.md");
  expect(await renderGuidelinesBlock(repoRoot)).toBe(block);
});

test("applying the block replaces an existing block and is idempotent", () => {
  const source = `before\n${GUIDELINES_START}\nold content\n${GUIDELINES_END}\nafter\n`;
  const block = `${GUIDELINES_START}\nnew content\n${GUIDELINES_END}`;
  const first = applyGuidelinesBlock(source, block);
  expect(first.status).toBe("updated");
  expect(first.source).toBe(`before\n${block}\nafter\n`);
  const second = applyGuidelinesBlock(first.source, block);
  expect(second.status).toBe("unchanged");
  expect(second.source).toBe(first.source);
});

test("applying without markers reports missing and leaves the text untouched", () => {
  const source = "# no markers here\n";
  const result = applyGuidelinesBlock(source, `${GUIDELINES_START}\nnew\n${GUIDELINES_END}`);
  expect(result.status).toBe("missing");
  expect(result.source).toBe(source);
});

test("refreshGuidelines keeps AGENTS.md current and settles to unchanged", async () => {
  const status = await refreshGuidelines(repoRoot);
  expect(["updated", "unchanged"]).toContain(status);
  const text = await Bun.file(`${repoRoot}/AGENTS.md`).text();
  expect(text).toContain("packages/ui/llms.txt");
  expect(await refreshGuidelines(repoRoot)).toBe("unchanged");
});
