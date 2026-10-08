import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  DOCUMENT_GLOBS,
  fillIdentityBlock,
  isTemplateRepo,
  SCOPE_FILE,
  stripTemplateOnlyBlocks,
  TEMPLATE_DIR,
  TEMPLATE_ONLY_START,
} from "../gates/lifecycle.ts";
import { clearFileIndexes, fileIndex } from "../lib/file-index.ts";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { repoRoot } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

/** Files whose identity block `project:adopt` fills with the project name and purpose. */
const IDENTITY_FILES = ["AGENTS.md", "README.md", ".agents/qa-project-context.md"] as const;
const TEMPLATE_TASK_GLOB = "docs/tasks/F3.*.md";

export type AdoptResult = { stripped: string[]; tasks: string[] };

function identityContent(file: string, name: string, purpose: string): string {
  if (file === "AGENTS.md") return `- **Name:** ${name}\n- **Purpose:** ${purpose}`;
  return `**${name}** — ${purpose}.`;
}

/**
 * Turns a template fork into a project: strip every template-only block, fill the identity blocks,
 * delete `docs/template/`, `template.scope.json` and the template-program tasks, then regenerate
 * the guidelines block for the installed catalog. Refuses to run on a repository that already
 * adopted (`docs/template/` is the template marker).
 */
export async function adoptProject(root: string, options: { name: string; purpose: string }): Promise<AdoptResult> {
  if (!(await isTemplateRepo(root))) {
    throw new Error(
      "This repository is already a project: docs/template/ is missing. bun erp project:adopt refuses to run twice.",
    );
  }

  const agents = await Bun.file(join(root, "AGENTS.md")).text();
  if (fillIdentityBlock(agents, "") === undefined) {
    throw new Error("AGENTS.md has no project-identity block; adopt only runs on an unmodified template checkout.");
  }

  const index = fileIndex(root);
  const stripped: string[] = [];
  for (const file of await index.files([...DOCUMENT_GLOBS])) {
    let source: string;
    try {
      source = await index.text(file);
    } catch {
      continue;
    }
    if (!source.includes(TEMPLATE_ONLY_START)) continue;
    await Bun.write(join(root, file), stripTemplateOnlyBlocks(source));
    stripped.push(file);
  }

  for (const file of IDENTITY_FILES) {
    const path = join(root, file);
    if (!(await Bun.file(path).exists())) continue;
    const filled = fillIdentityBlock(await Bun.file(path).text(), identityContent(file, options.name, options.purpose));
    if (filled !== undefined) await Bun.write(path, filled);
  }

  await rm(join(root, TEMPLATE_DIR), { recursive: true, force: true });
  await rm(join(root, SCOPE_FILE), { force: true });
  const tasks = await index.files(TEMPLATE_TASK_GLOB);
  for (const task of tasks) await rm(join(root, task), { force: true });

  // The index memoized pre-adopt file lists and contents; the guidelines pass must see the result.
  clearFileIndexes();
  await refreshGuidelines(root);
  return { stripped, tasks };
}

export const commands = [
  defineCommand("project:adopt", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["name", "purpose"] });
    const unexpected = parsed.positional[0];
    if (unexpected) throw new Error(`Unexpected argument "${unexpected}". Use --name <name> --purpose "<one line>".`);

    const name = resolveRequired(parsed.values.get("name"), "Project name");
    const purpose = resolveRequired(parsed.values.get("purpose"), "Project purpose (one line)");
    if (!name || !purpose) throw new Error('Usage: bun erp project:adopt --name <name> --purpose "<one line>"');

    const result = await adoptProject(repoRoot, { name, purpose });
    process.stdout.write(
      `Adopted "${name}": removed ${TEMPLATE_DIR}/, stripped template-only blocks in ${result.stripped.length} file(s), ` +
        `wrote the identity block, deleted ${SCOPE_FILE} and ${result.tasks.length} template task(s).\n` +
        "This repository is now a project; the scope gate is skipped.\n",
    );
  }),
];
