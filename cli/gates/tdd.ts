export type TddFinding = { file: string; rule: string; detail: string };

/**
 * Feature names come from files, not directories: `Bun.Glob` matches files, and Git does not track
 * empty directories, so a directory with no file is not a feature.
 */
function featureNames(root: string): string[] {
  const names = new Set<string>();
  for (const file of new Bun.Glob("apps/server/features/*/*").scanSync({ cwd: root })) {
    const name = file.split("/")[3];
    if (name) names.add(name);
  }
  for (const file of new Bun.Glob("apps/server/features/*.ts").scanSync({ cwd: root })) {
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
  const findings: TddFinding[] = [];
  for (const name of featureNames(root)) {
    const testFiles = [...new Bun.Glob(`apps/server/tests/features/${name}/**/*.test.ts`).scanSync({ cwd: root })];
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
