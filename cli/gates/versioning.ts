import { join } from "node:path";

export type VersionFinding = { packageName: string; version: string; expected: string; detail: string };

/** The monorepo uses one SemVer release across deployable apps and shared packages. */
export async function checkWorkspaceVersions(root: string): Promise<VersionFinding[]> {
  const rootManifest = (await Bun.file(join(root, "package.json")).json()) as {
    version?: string;
    workspaces?: string[];
  };
  const expected = rootManifest.version ?? "";
  const findings: VersionFinding[] = [];
  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    findings.push({
      packageName: "root",
      version: expected,
      expected: "x.y.z",
      detail: "Root version must be stable SemVer.",
    });
  }

  for (const workspace of rootManifest.workspaces ?? []) {
    const manifestPath = `${workspace}/package.json`;
    if (!(await Bun.file(join(root, manifestPath)).exists())) {
      findings.push({
        packageName: workspace,
        version: "missing",
        expected,
        detail:
          "Workspace has no package.json, so a fresh `bun install` fails; apps/ entries are added by `bun erp init`, not committed.",
      });
      continue;
    }
    const manifest = (await Bun.file(join(root, manifestPath)).json()) as { name?: string; version?: string };
    if (!manifest.version || manifest.version !== expected) {
      findings.push({
        packageName: manifest.name ?? manifestPath,
        version: manifest.version ?? "missing",
        expected,
        detail: "Workspace package version must match the root release version.",
      });
    }
  }
  return findings;
}
