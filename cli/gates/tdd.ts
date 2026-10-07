import { fileIndex } from "../lib/file-index.ts";

export type TddFinding = { file: string; rule: string; detail: string };

/**
 * Feature names come from files, not directories: `Bun.Glob` matches files, and Git does not track
 * empty directories, so a directory with no file is not a feature.
 */
async function featureNames(root: string): Promise<string[]> {
  const index = fileIndex(root);
  const names = new Set<string>();
  for (const file of await index.files("apps/server/features/*/*")) {
    const name = file.split("/")[3];
    if (name) names.add(name);
  }
  for (const file of await index.files("apps/server/features/*.ts")) {
    const name = file.slice(file.lastIndexOf("/") + 1).replace(/\.ts$/, "");
    if (name !== "index") names.add(name);
  }
  return [...names].sort();
}

/**
 * TDD gate. A server feature is a claim; its test is the evidence. Every feature under
 * `apps/server/features` must have at least one `*.test.ts` under `apps/server/tests/features/<name>/`.
 * Generators already emit that test, so a new feature cannot land without one.
 */
export async function checkTdd(root: string): Promise<TddFinding[]> {
  const index = fileIndex(root);
  const findings: TddFinding[] = [];
  for (const name of await featureNames(root)) {
    const testFiles = await index.files(`apps/server/tests/features/${name}/**/*.test.ts`);
    if (testFiles.length === 0) {
      findings.push({
        file: `apps/server/features/${name}`,
        rule: "TDD_TEST_MISSING",
        detail: `no test under apps/server/tests/features/${name}/ — write the failing test first`,
      });
    }
  }
  return findings;
}
