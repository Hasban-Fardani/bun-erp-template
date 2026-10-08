import { expect, test } from "bun:test";
import {
  applyGuidelinesBlock,
  GUIDELINES_END,
  GUIDELINES_START,
  refreshGuidelines,
  renderGuidelinesBlock,
} from "@cli/lib/guidelines.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("the generated block lists installed apps, packages and features with guide paths", async () => {
  const block = await renderGuidelinesBlock(repoRoot);
  expect(block.startsWith(GUIDELINES_START)).toBe(true);
  expect(block.endsWith(GUIDELINES_END)).toBe(true);
  expect(block).toContain("`server`");
  expect(block).toContain("@bun-erp/server");
  expect(block).toContain("packages/ui/llms.txt");
  // The catalog guide appears only while no feature is installed; an installed feature lists its
  // own README instead, so either form is a correct block.
  expect(block).toMatch(/templates\/features\/(?:README\.md|[a-z0-9-]+\/README\.md)/);
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

test("refreshGuidelines rewrites the block on a fixture and settles to unchanged", async () => {
  await withTempRoot(
    { "AGENTS.md": `before\n${GUIDELINES_START}\nstate-neutral\n${GUIDELINES_END}\nafter\n` },
    async (root) => {
      expect(await refreshGuidelines(root)).toBe("updated");
      const text = await Bun.file(`${root}/AGENTS.md`).text();
      expect(text).toContain("- Apps: none installed");
      expect(await refreshGuidelines(root)).toBe("unchanged");
    },
    "guidelines-",
  );
});
