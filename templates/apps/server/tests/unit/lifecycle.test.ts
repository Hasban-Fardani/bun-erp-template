import { expect, test } from "bun:test";
import { adoptProject } from "@cli/commands/project.ts";
import { checkLifecycle } from "@cli/gates/lifecycle.ts";
import { checkScope } from "@cli/gates/scope.ts";
import { withTempRoot } from "./support/temp-root.ts";

const MARKED_AGENTS = `# Agent instructions

<!-- project-identity:start -->
<!-- template-only -->
This repository is the template.
<!-- /template-only -->
<!-- project-identity:end -->
`;

test("template mode: docs/template/ exists, so template-only markers are allowed", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "AGENTS.md": MARKED_AGENTS,
    },
    async (root) => {
      expect(await checkLifecycle(root)).toEqual([]);
    },
    "lifecycle-template-",
  );
});

test("project mode: a leftover template-only marker fails the gate", async () => {
  await withTempRoot(
    {
      "AGENTS.md": `# Agent instructions\n\n<!-- template-only -->\nstale template rule\n<!-- /template-only -->\n`,
    },
    async (root) => {
      const findings = await checkLifecycle(root);
      expect(findings.join("\n")).toContain("AGENTS.md");
      expect(findings.join("\n")).toContain("template-only");
    },
    "lifecycle-marker-",
  );
});

test("project mode: a leftover template.scope.json fails the gate", async () => {
  await withTempRoot(
    {
      "AGENTS.md": "# Agent instructions\n",
      "template.scope.json": "{}\n",
    },
    async (root) => {
      expect((await checkLifecycle(root)).join("\n")).toContain("template.scope.json");
    },
    "lifecycle-scope-",
  );
});

test("project mode: an adopted repository with no markers or scope file is clean", async () => {
  await withTempRoot(
    {
      "AGENTS.md": "# Agent instructions\n",
      "README.md": "# Acme\n",
    },
    async (root) => {
      expect(await checkLifecycle(root)).toEqual([]);
    },
    "lifecycle-project-",
  );
});

test("project mode: the scope gate is skipped, so no scope file is required", async () => {
  await withTempRoot(
    { "README.md": "project notes\n" },
    async (root) => {
      expect(await checkScope(root)).toEqual([]);
    },
    "lifecycle-scope-skip-",
  );
});

test("template mode: the scope gate still applies its manifest", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "docs/notes.md": "widget\n",
      "template.scope.json": JSON.stringify({
        allowed: { topLevelDirs: ["docs"], apps: [] },
        forbidden: {
          paths: [],
          patterns: [{ id: "widget-word", regex: "\\bwidget\\b", reason: "test", allowIn: [] }],
        },
      }),
    },
    async (root) => {
      await Bun.$`git init -q`.cwd(root).quiet();
      const findings = await checkScope(root);
      expect(findings.map((finding) => finding.detail).join("\n")).toContain("widget");
    },
    "lifecycle-scope-manifest-",
  );
});

test("project:adopt strips markers, writes identity, removes template material, and refuses twice", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "template.scope.json": "{}\n",
      "docs/tasks/F3.3-goal-alignment.md": "---\nid: F3.3\nstatus: in_progress\n---\n",
      "docs/tasks/F1.1-adr.md": "---\nid: F1.1\ntitle: x\nstatus: in_progress\n---\n",
      "AGENTS.md": `${MARKED_AGENTS}
<!-- guidelines:start -->
old block
<!-- guidelines:end -->
`,
      "README.md": `# Bun ERP Template
<!-- project-identity:start -->
<!-- template-only -->
Starter for internal applications.
<!-- /template-only -->
<!-- project-identity:end -->
`,
      ".agents/qa-project-context.md": `## Product
<!-- project-identity:start -->
<!-- template-only -->
Reusable starter.
<!-- /template-only -->
<!-- project-identity:end -->
`,
    },
    async (root) => {
      await adoptProject(root, { name: "Acme", purpose: "ERP for Acme" });

      const agents = await Bun.file(`${root}/AGENTS.md`).text();
      expect(agents).toContain("Acme");
      expect(agents).toContain("ERP for Acme");
      expect(agents).not.toContain("template-only");
      expect(agents).toContain("- Apps: none installed");
      expect(await Bun.file(`${root}/README.md`).text()).not.toContain("template-only");
      expect(await Bun.file(`${root}/.agents/qa-project-context.md`).text()).not.toContain("template-only");
      expect(await Bun.file(`${root}/docs/template/README.md`).exists()).toBe(false);
      expect(await Bun.file(`${root}/template.scope.json`).exists()).toBe(false);
      expect(await Bun.file(`${root}/docs/tasks/F3.3-goal-alignment.md`).exists()).toBe(false);
      expect(await Bun.file(`${root}/docs/tasks/F1.1-adr.md`).exists()).toBe(true);
      expect(await checkLifecycle(root)).toEqual([]);

      await expect(adoptProject(root, { name: "Other", purpose: "Again" })).rejects.toThrow(/already a project|twice/);
    },
    "lifecycle-adopt-",
  );
});
