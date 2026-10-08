import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

/**
 * F3.3 Phase L — repository lifecycle. `docs/template/` marks the template repository; a fork that
 * ran `bun erp project:adopt` has no such directory and is a project, where template-only rules
 * must be gone and the scope gate no longer applies.
 */
export const TEMPLATE_DIR = "docs/template";
export const SCOPE_FILE = "template.scope.json";
export const TEMPLATE_ONLY_START = "<!-- template-only -->";
export const TEMPLATE_ONLY_END = "<!-- /template-only -->";
export const IDENTITY_START = "<!-- project-identity:start -->";
export const IDENTITY_END = "<!-- project-identity:end -->";

/** First-party documents the marker rule covers; installed `.agents/skills/` stay external. */
export const DOCUMENT_GLOBS = [
  "*.md",
  "docs/**/*.md",
  "skills/**/*.md",
  "templates/**/*.md",
  "packages/**/*.md",
  ".agents/qa-project-context.md",
] as const;

export async function isTemplateRepo(root: string): Promise<boolean> {
  return directoryExists(join(root, TEMPLATE_DIR));
}

/** Removes every marked block; used by `project:adopt` and by the identity write. */
export function stripTemplateOnlyBlocks(source: string): string {
  return source.replace(/<!-- template-only -->[\s\S]*?<!-- \/template-only -->\n?/g, "").replace(/\n{3,}/g, "\n\n");
}

/** Replaces the content between the identity markers; undefined when a file carries no block. */
export function fillIdentityBlock(source: string, content: string): string | undefined {
  const start = source.indexOf(IDENTITY_START);
  const end = source.indexOf(IDENTITY_END, start + IDENTITY_START.length);
  if (start < 0 || end < 0) return undefined;
  return `${source.slice(0, start + IDENTITY_START.length)}\n${content}\n${source.slice(end)}`;
}

export async function checkLifecycle(root: string): Promise<string[]> {
  if (await isTemplateRepo(root)) return [];
  const findings: string[] = [];
  if (await Bun.file(join(root, SCOPE_FILE)).exists()) {
    findings.push(
      `${SCOPE_FILE}: present in a project; bun erp project:adopt deletes it and the scope gate then skips`,
    );
  }
  const index = fileIndex(root);
  for (const file of await index.files([...DOCUMENT_GLOBS])) {
    let body: string;
    try {
      body = await index.text(file);
    } catch {
      continue;
    }
    if (body.includes(TEMPLATE_ONLY_START) || body.includes(TEMPLATE_ONLY_END)) {
      findings.push(`${file}: template-only marker left in a project; run bun erp project:adopt or remove the block`);
    }
  }
  return findings;
}
