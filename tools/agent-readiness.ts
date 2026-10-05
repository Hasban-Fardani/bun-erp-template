import { Database } from "bun:sqlite";
import { REQUIRED_AGENT_SKILLS } from "./agent-skills.ts";

export type AgentReadinessInput = {
  installedSkills: string[];
  indexedFiles: string[];
  indexError?: string;
};

const REQUIRED_INDEXED_FILES = [
  "apps/server/http/app.ts",
  "apps/web/src/main.tsx",
  "apps/mobile/src/main.tsx",
] as const;

export function evaluateAgentReadiness(input: AgentReadinessInput): string[] {
  const findings: string[] = [];
  for (const skill of REQUIRED_AGENT_SKILLS) {
    if (!input.installedSkills.includes(skill)) findings.push(`Install the project skill .agents/skills/${skill}.`);
  }
  if (input.indexError) findings.push(`CodeGraph index is unavailable: ${input.indexError}`);
  const indexedFiles = new Set(input.indexedFiles);
  for (const file of REQUIRED_INDEXED_FILES) {
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

  let indexedFiles: string[] = [];
  let indexError: string | undefined;
  const indexPath = `${root}/.codegraph/codegraph.db`;
  try {
    if (!(await Bun.file(indexPath).exists())) throw new Error("missing .codegraph/codegraph.db");
    const database = new Database(indexPath, { readonly: true });
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
  return evaluateAgentReadiness({ installedSkills, indexedFiles, indexError });
}
