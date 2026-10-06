import { Database } from "bun:sqlite";
import { REQUIRED_AGENT_SKILLS } from "./agent-skills.ts";
import { CODEGRAPH_VERSION, codegraphCommand } from "./codegraph.ts";

export type AgentReadinessInput = {
  installedSkills: string[];
  indexedFiles: string[];
  /** Files the index must contain; callers pass only the ones that exist on disk (apps ship empty). */
  requiredIndexedFiles?: readonly string[];
  indexError?: string;
  cliVersion?: string;
  cliError?: string;
};

const REQUIRED_INDEXED_FILES = ["apps/server/http/app.ts", "apps/web/src/main.tsx"] as const;

export function evaluateAgentReadiness(input: AgentReadinessInput): string[] {
  const findings: string[] = [];
  for (const skill of REQUIRED_AGENT_SKILLS) {
    if (!input.installedSkills.includes(skill)) findings.push(`Install the project skill .agents/skills/${skill}.`);
  }
  if (input.indexError) findings.push(`CodeGraph index is unavailable: ${input.indexError}`);
  if (input.cliError) {
    findings.push(`CodeGraph CLI is unavailable: ${input.cliError}`);
  } else if (input.cliVersion && input.cliVersion !== CODEGRAPH_VERSION) {
    findings.push(
      `CodeGraph CLI reports ${input.cliVersion}; the project pins ${CODEGRAPH_VERSION}. Run bun erp init.`,
    );
  }
  const indexedFiles = new Set(input.indexedFiles);
  for (const file of input.requiredIndexedFiles ?? REQUIRED_INDEXED_FILES) {
    if (!indexedFiles.has(file)) findings.push(`CodeGraph has not indexed ${file}; run bun erp init.`);
  }
  if (input.indexedFiles.length < 30) findings.push("CodeGraph index is incomplete; run bun erp init.");
  return findings;
}

export async function checkAgentReadiness(root: string): Promise<string[]> {
  const installedSkills: string[] = [];
  for (const skill of REQUIRED_AGENT_SKILLS) {
    if (await Bun.file(`${root}/.agents/skills/${skill}/SKILL.md`).exists()) installedSkills.push(skill);
  }

  // `apps/` ships empty, so an app file can only be required when the app is actually installed.
  const requiredIndexedFiles: string[] = [];
  for (const file of REQUIRED_INDEXED_FILES) {
    if (await Bun.file(`${root}/${file}`).exists()) requiredIndexedFiles.push(file);
  }

  let indexedFiles: string[] = [];
  let indexError: string | undefined;
  const indexPath = `${root}/.codegraph/codegraph.db`;
  try {
    if (!(await Bun.file(indexPath).exists())) throw new Error("missing .codegraph/codegraph.db");
    // Bun's SQLite cannot open a WAL database read-only when the `-shm` sidecar is absent (a fresh
    // `bun erp init` leaves none), so open read-write and only ever read from it.
    const database = new Database(indexPath);
    try {
      indexedFiles = database
        .query<{ path: string }, []>("SELECT path FROM files")
        .all()
        .map(({ path }) => path);
    } finally {
      database.close();
    }
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  let cliVersion: string | undefined;
  let cliError: string | undefined;
  try {
    const probe = Bun.spawnSync(codegraphCommand("--version"), { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (probe.exitCode !== 0) throw new Error(probe.stderr.toString().trim() || `exit ${probe.exitCode}`);
    cliVersion = probe.stdout.toString().trim().split(/\s+/).filter(Boolean).pop();
  } catch (error) {
    cliError = error instanceof Error ? error.message : String(error);
  }

  return evaluateAgentReadiness({
    installedSkills,
    indexedFiles,
    requiredIndexedFiles,
    indexError,
    cliVersion,
    cliError,
  });
}
