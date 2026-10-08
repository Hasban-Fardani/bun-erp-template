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

export type AdoptResult = { stripped: string[]; tasks: string[]; renamed: string[] };

const TEMPLATE_SLUG = "bun-erp-template";
/** Files that carry names derived from the template slug (worker, queue, bucket, image, URLs). */
const RENAME_FILES = ["wrangler.jsonc", ".github/workflows/ci.yml", "docs/deployment.md"] as const;

const TASKS_README = `# Tasks

Work records for this project. Create one with \`bun erp task:new <id> "<title>"\`; each file carries
front matter (\`id\`, \`title\`, \`status\`, \`evidence\`) that \`bun erp check\` validates. Status moves are
human-owned: agents leave work \`in_progress\` with evidence. Tasks record history, not current
implementation guidance; the canonical documents are listed in \`docs/README.md\`.
`;

/** Lowercase DNS-safe slug used for the package, Worker, queue and bucket names. */
export function projectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  if (!slug) throw new Error(`Cannot derive a slug from the project name "${name}"; use letters or digits.`);
  return slug;
}

async function renameFromTemplate(root: string, slug: string): Promise<string[]> {
  const renamed: string[] = [];
  const pkgPath = join(root, "package.json");
  if (await Bun.file(pkgPath).exists()) {
    const source = await Bun.file(pkgPath).text();
    const next = source.replace(/("name"\s*:\s*)"bun-erp-template"/, `$1"${slug}"`);
    if (next !== source) {
      await Bun.write(pkgPath, next);
      renamed.push("package.json");
    }
  }
  for (const file of RENAME_FILES) {
    const path = join(root, file);
    if (!(await Bun.file(path).exists())) continue;
    const source = await Bun.file(path).text();
    const next = source.replaceAll(TEMPLATE_SLUG, slug);
    if (next === source) continue;
    await Bun.write(path, next);
    renamed.push(file);
  }
  return renamed;
}

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
  const slug = projectSlug(options.name);
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
    if (filled !== undefined) {
      const titled = file === "README.md" ? filled.replace(/^# Bun ERP Template[ \t]*$/m, `# ${options.name}`) : filled;
      await Bun.write(path, titled);
    }
  }

  const renamed = await renameFromTemplate(root, slug);

  await rm(join(root, TEMPLATE_DIR), { recursive: true, force: true });
  await rm(join(root, SCOPE_FILE), { force: true });
  const tasks = await index.files(TEMPLATE_TASK_GLOB);
  for (const task of tasks) await rm(join(root, task), { force: true });
  await Bun.write(join(root, "docs/tasks/README.md"), TASKS_README);

  // The index memoized pre-adopt file lists and contents; the guidelines pass must see the result.
  clearFileIndexes();
  await refreshGuidelines(root);
  return { stripped, tasks, renamed };
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
        `wrote the identity block, renamed ${result.renamed.length} file(s) to "${projectSlug(name)}", wrote docs/tasks/README.md, deleted ${SCOPE_FILE} and ${result.tasks.length} template task(s).\n` +
        "This repository is now a project; the scope gate is skipped.\n",
    );
  }),
];
