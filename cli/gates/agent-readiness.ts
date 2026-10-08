import { Database } from "bun:sqlite";
import { GUIDELINES_END, GUIDELINES_START } from "../lib/guidelines.ts";
import { REQUIRED_AGENT_SKILLS } from "./agent-skills.ts";
import { CODEGRAPH_VERSION } from "./codegraph.ts";
import { isTemplateRepo } from "./lifecycle.ts";

export type AgentReadinessInput = {
  installedSkills: string[];
  indexedFiles: string[];
  /** Files the index must contain; callers pass only the ones that exist on disk (apps ship empty). */
  requiredIndexedFiles?: readonly string[];
  indexError?: string;
  /** `indexed_with_version` from the CodeGraph index metadata; absent on an index built by an old CLI. */
  indexVersion?: string;
  /**
   * The template repo commits a state-neutral guidelines block, so its content is ignored there.
   * A project must carry the block `bun erp init` / `ai:update` generates for its installed catalog.
   */
  templateMode?: boolean;
  guidelinesBlock?: string;
};

const REQUIRED_INDEXED_FILES = ["apps/server/http/app.ts", "apps/web/src/main.tsx"] as const;

export function evaluateAgentReadiness(input: AgentReadinessInput): string[] {
  const findings: string[] = [];
  for (const skill of REQUIRED_AGENT_SKILLS) {
    if (!input.installedSkills.includes(skill)) findings.push(`Install the project skill .agents/skills/${skill}.`);
  }
  if (input.indexError) {
    findings.push(`CodeGraph index is unavailable: ${input.indexError}`);
  } else if (!input.indexVersion) {
    findings.push("CodeGraph index does not record its version; run bun erp init.");
  } else if (input.indexVersion !== CODEGRAPH_VERSION) {
    findings.push(
      `CodeGraph indexed this project with ${input.indexVersion}; the project pins ${CODEGRAPH_VERSION}. Run bun erp init.`,
    );
  }
  const indexedFiles = new Set(input.indexedFiles);
  for (const file of input.requiredIndexedFiles ?? REQUIRED_INDEXED_FILES) {
    if (!indexedFiles.has(file)) findings.push(`CodeGraph has not indexed ${file}; run bun erp init.`);
  }
  if (input.indexedFiles.length < 30) findings.push("CodeGraph index is incomplete; run bun erp init.");
  if (!input.templateMode) {
    if (!input.guidelinesBlock) {
      findings.push("AGENTS.md has no guidelines block; run bun erp ai:update.");
    } else if (!input.guidelinesBlock.includes("- Apps:")) {
      findings.push("AGENTS.md guidelines block is not generated for this project; run bun erp ai:update.");
    }
  }
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
  let indexVersion: string | undefined;
  const indexPath = `${root}/.codegraph/codegraph.db`;
  try {
    if (!(await Bun.file(indexPath).exists())) throw new Error("missing .codegraph/codegraph.db");
    const index = readIndex(indexPath);
    indexedFiles = index.indexedFiles;
    indexVersion = index.indexVersion;
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  const templateMode = await isTemplateRepo(root);
  let guidelinesBlock: string | undefined;
  try {
    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    const start = agents.indexOf(GUIDELINES_START);
    const end = agents.indexOf(GUIDELINES_END);
    guidelinesBlock = start >= 0 && end > start ? agents.slice(start, end + GUIDELINES_END.length) : undefined;
  } catch {
    guidelinesBlock = undefined;
  }

  return evaluateAgentReadiness({
    installedSkills,
    indexedFiles,
    requiredIndexedFiles,
    indexError,
    indexVersion,
    templateMode,
    guidelinesBlock,
  });
}

type IndexRead = { indexedFiles: string[]; indexVersion?: string };

/**
 * Bun's SQLite refuses a read-only WAL database when the `-shm` sidecar is absent (a fresh
 * `bun erp init` leaves none), so fall back to a read-write open and still only read. The pinned
 * CLI version comes from the index metadata: no `bunx` probe, so the gate stays offline.
 */
function readIndex(path: string): IndexRead {
  try {
    return readIndexFrom(new Database(path, { readonly: true }));
  } catch {
    return readIndexFrom(new Database(path));
  }
}

function readIndexFrom(database: Database): IndexRead {
  try {
    const indexedFiles = database
      .query<{ path: string }, []>("SELECT path FROM files")
      .all()
      .map(({ path }) => path);
    return { indexedFiles, indexVersion: readIndexVersion(database) };
  } finally {
    database.close();
  }
}

function readIndexVersion(database: Database): string | undefined {
  try {
    return database
      .query<{ value: string }, []>("SELECT value FROM project_metadata WHERE key = 'indexed_with_version'")
      .get()?.value;
  } catch {
    // Old index without metadata: the caller reports the missing version.
    return undefined;
  }
}
