import { resolve } from "node:path";
import { repoRoot } from "./repo.ts";
import { listWorkspaceApps, type WorkspaceApp } from "./workspace-apps.ts";

/** `apps/` ships empty: every command that touches an app checks first and points at `bun erp init`. */
export async function isAppInstalled(name: string): Promise<boolean> {
  return Bun.file(resolve(repoRoot, "apps", name, "package.json")).exists();
}

export async function requireApps(names: readonly string[]): Promise<void> {
  const missing: string[] = [];
  for (const name of names) {
    if (!(await isAppInstalled(name))) missing.push(`apps/${name}`);
  }
  if (missing.length === 0) return;
  throw new Error(
    `${missing.join(", ")} not installed. Run \`bun erp init\` (or \`bun erp apps:create <name> <server|web|mobile>\`) first.`,
  );
}

function printAppTable(apps: WorkspaceApp[]): void {
  const headers = ["app", "package", "version", "port", "build", "tests"];
  const rows = apps.map((app) => [
    app.name,
    app.packageName,
    app.version,
    app.port ? String(app.port) : "—",
    app.buildDir ? `built (${app.buildDir})` : "not built",
    app.testFiles > 0 ? String(app.testFiles) : "—",
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  process.stdout.write(`${headers.map((header, index) => header.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  for (const row of rows) {
    process.stdout.write(`${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  }
}

export async function showApps(): Promise<void> {
  const apps = await listWorkspaceApps(repoRoot);
  if (apps.length === 0) {
    process.stdout.write("No workspace apps found. Create one with bun erp apps:create <name>.\n");
    return;
  }
  printAppTable(apps);
}

export async function envKeyCount(path: string): Promise<number | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return (await file.text()).split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).length;
}
