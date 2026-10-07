/**
 * `packages/ui/llms.txt` is the agent lookup path for the pattern library: a component that is
 * absent from the guide is one agents improvise around. The gate keeps the index and the source
 * tree in sync in both directions — every `src/**` module must be listed, and every `layer/module.ext`
 * reference in the guide must still resolve. Removed modules are mentioned by package export name
 * (for example `@bun-erp/data-table/server-table`), never as a `src` path, so history does not read
 * as drift.
 */
import { directoryExists } from "./exists.ts";

const GUIDE_PATH = "packages/ui/llms.txt";
const UI_SOURCE = "packages/ui/src";
const LAYERS = "atoms|molecules|organisms|templates|lib|types";
/** Backticked module references like `atoms/button.tsx`; the shape is the guide's contract. */
const MODULE_REFERENCE = new RegExp(`\`((?:${LAYERS})/[a-z0-9][a-z0-9.-]*\\.tsx?)\``, "g");

export async function checkUiGuide(root: string): Promise<string[]> {
  if (!(await directoryExists(`${root}/${UI_SOURCE}`))) return [];
  const guideFile = Bun.file(`${root}/${GUIDE_PATH}`);
  if (!(await guideFile.exists())) {
    return [`${GUIDE_PATH}: missing UI guide — every component must be findable from it`];
  }
  const guide = await guideFile.text();

  const modules = new Set<string>();
  for (const file of new Bun.Glob(`${UI_SOURCE}/**/*.{ts,tsx}`).scanSync({ cwd: root })) {
    modules.add(file.slice(`${UI_SOURCE}/`.length));
  }
  const referenced = new Set([...guide.matchAll(MODULE_REFERENCE)].flatMap((match) => (match[1] ? [match[1]] : [])));

  const findings: string[] = [];
  for (const module of [...modules].sort()) {
    if (!referenced.has(module)) {
      findings.push(`${GUIDE_PATH}: missing ${module} — add its layer, purpose and use-instead-of note`);
    }
  }
  for (const module of [...referenced].sort()) {
    if (!modules.has(module)) {
      findings.push(`${GUIDE_PATH}: references ${module}, which no longer exists — remove the stale entry`);
    }
  }
  return findings;
}
