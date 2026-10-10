import { expect, test } from "bun:test";
import {
  applyGuidelinesBlock,
  GUIDELINES_END,
  GUIDELINES_START,
  refreshGuidelines,
  renderGoalBlock,
  renderGuidelinesBlock,
  renderPlatformBlock,
} from "@cli/lib/guidelines.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("the generated block lists installed apps, packages and features with guide paths", async () => {
  const block = await renderGuidelinesBlock(repoRoot);
  expect(block.startsWith(GUIDELINES_START)).toBe(true);
  expect(block.endsWith(GUIDELINES_END)).toBe(true);
  expect(block).toContain("`server`");
  expect(block).toContain("@loom/server");
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

test("project mode points installed apps at project docs, never at the template catalog guide", async () => {
  await withTempRoot(
    { "apps/server/package.json": '{"name":"@acme/server"}\n', "AGENTS.md": "x\n" },
    async (root) => {
      const block = await renderGuidelinesBlock(root);
      expect(block).toContain("guide: `docs/development.md`");
      expect(block).not.toContain("templates/apps/README.md");
    },
    "guidelines-project-apps-",
  );
});

test("template mode keeps the catalog guide for apps without their own README", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "x\n",
      "apps/server/package.json": '{"name":"@acme/server"}\n',
      "AGENTS.md": "x\n",
    },
    async (root) => {
      expect(await renderGuidelinesBlock(root)).toContain("templates/apps/README.md");
    },
    "guidelines-template-apps-",
  );
});

test("goal and platform blocks are per target: VPS default, PBKDF2 fits Workers Free, scrypt needs Paid", () => {
  const goal = renderGoalBlock();
  expect(goal).toContain("VPS");
  expect(goal).toContain("PBKDF2");
  expect(goal).toContain("PASSWORD_HASH=scrypt");
  const platform = renderPlatformBlock();
  expect(platform).toContain("APP_DEPLOY_TARGET=cloudflare");
  expect(platform).toContain("PASSWORD_HASH=pbkdf2");
  expect(platform).toContain("Workers Paid");
  expect(platform).toContain("10 ms");
  expect(platform).toContain("VPS");
});

test("refreshGuidelines also regenerates the goal and platform blocks and settles", async () => {
  const agents = [
    "# A",
    "<!-- guidelines:start -->",
    "x",
    "<!-- guidelines:end -->",
    "<!-- goal:start -->",
    "stale goal",
    "<!-- goal:end -->",
    "<!-- platform-limits:start -->",
    "stale platform",
    "<!-- platform-limits:end -->",
    "",
  ].join("\n");
  await withTempRoot(
    { "AGENTS.md": agents },
    async (root) => {
      expect(await refreshGuidelines(root)).toBe("updated");
      const text = await Bun.file(`${root}/AGENTS.md`).text();
      expect(text).not.toContain("stale");
      expect(text).toContain("APP_DEPLOY_TARGET=cloudflare");
      expect(await refreshGuidelines(root)).toBe("unchanged");
    },
    "guidelines-blocks-",
  );
});
