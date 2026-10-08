import { expect, test } from "bun:test";
import { adoptProject, projectSlug } from "@cli/commands/project.ts";
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

test("project:adopt renames package, wrangler, queue, bucket and URL names derived from the template", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "AGENTS.md": `${MARKED_AGENTS}\n<!-- guidelines:start -->\nold\n<!-- guidelines:end -->\n`,
      "package.json": '{\n  "name": "bun-erp-template",\n  "private": true\n}\n',
      "wrangler.jsonc": `{
  "name": "bun-erp-template",
  "r2_buckets": [{ "binding": "STORAGE", "bucket_name": "bun-erp-template-files" }],
  // wrangler queues create bun-erp-template-jobs
  "vars": { "APP_URL": "https://bun-erp-template.example.workers.dev" }
}
`,
    },
    async (root) => {
      await adoptProject(root, { name: "Acme ERP!", purpose: "ERP for Acme" });
      const pkg = JSON.parse(await Bun.file(`${root}/package.json`).text()) as { name: string };
      expect(pkg.name).toBe("acme-erp");
      const wrangler = await Bun.file(`${root}/wrangler.jsonc`).text();
      expect(wrangler).toContain('"name": "acme-erp"');
      expect(wrangler).toContain("acme-erp-files");
      expect(wrangler).toContain("acme-erp-jobs");
      expect(wrangler).toContain("https://acme-erp.example.workers.dev");
      expect(wrangler).not.toContain("bun-erp-template");
    },
    "lifecycle-adopt-names-",
  );
});

test("projectSlug derives a lowercase DNS-safe name and rejects an empty result", () => {
  expect(projectSlug("Acme ERP!")).toBe("acme-erp");
  expect(projectSlug("  --Hello__World--  ")).toBe("hello-world");
  expect(() => projectSlug("!!!")).toThrow(/project name/i);
});

test("project:adopt writes docs/tasks/README.md and the task gate ignores it", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "AGENTS.md": MARKED_AGENTS,
    },
    async (root) => {
      await adoptProject(root, { name: "Acme", purpose: "ERP for Acme" });
      const readme = await Bun.file(`${root}/docs/tasks/README.md`).text();
      expect(readme).toContain("bun erp task:new");
      const { loadTasks } = await import("@cli/gates/tasks.ts");
      expect(await loadTasks(`${root}/docs/tasks`)).toEqual([]);
      expect(await checkLifecycle(root)).toEqual([]);
    },
    "lifecycle-adopt-tasks-",
  );
});

test("project mode: leak phrases outside template-only markers are findings", async () => {
  await withTempRoot(
    {
      "README.md": "# Bun ERP Template\n",
      "docs/a.md": "The repo ships `apps/` empty.\n",
      "docs/b.md": "Use this template carefully.\n",
      "docs/c.md": "## Deployment (F3.2 Q9)\n",
      "docs/tasks/F3.9-x.md": "history F3.9 and this template\n",
      "docs/ok.md": "Clean project text about F30 and templates/apps catalogs.\n",
    },
    async (root) => {
      const text = (await checkLifecycle(root)).join("\n");
      expect(text).toContain("README.md");
      expect(text).toContain("docs/a.md");
      expect(text).toContain("docs/b.md");
      expect(text).toContain("docs/c.md");
      expect(text).not.toContain("docs/tasks");
      expect(text).not.toContain("docs/ok.md");
    },
    "lifecycle-leaks-",
  );
});

test("template mode: leak phrases are allowed", async () => {
  await withTempRoot(
    {
      "docs/template/README.md": "# Template material\n",
      "README.md": "# Bun ERP Template\nThis template ships `apps/` empty (F3.4).\n",
    },
    async (root) => {
      expect(await checkLifecycle(root)).toEqual([]);
    },
    "lifecycle-leaks-template-",
  );
});
