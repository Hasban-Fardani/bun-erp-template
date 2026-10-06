import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AGENT_SKILL_SOURCES } from "../gates/agent-skills.ts";
import { CODEGRAPH_VERSION, codegraphCommand, codegraphMcpCommand } from "../gates/codegraph.ts";

const root = resolve(import.meta.dir, "../..");
const SKILLS_CLI_VERSION = "1.7.0";
const codegraphDatabase = resolve(root, ".codegraph/codegraph.db");

type JsonObject = Record<string, unknown>;

async function run(argv: string[], label: string): Promise<void> {
  const child = Bun.spawn(argv, { cwd: root, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${label} failed with exit ${code}`);
}

/** Agent wiring is best-effort: a developer without a given agent must still get a usable index. */
async function tryRun(argv: string[], label: string): Promise<void> {
  try {
    await run(argv, label);
  } catch (error) {
    process.stderr.write(`${label} skipped: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/**
 * The CodeGraph MCP daemon holds the index lock while it auto-syncs edits, so a fresh `init` right
 * after a batch of file changes can collide with it. The CLI itself recommends retrying; do that.
 */
async function runWithLockRetry(argv: string[], label: string, attempts = 4, delayMs = 1500): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run(argv, label);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      process.stderr.write(`${label} is busy (attempt ${attempt}/${attempts}); retrying…\n`);
      await Bun.sleep(delayMs);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

/**
 * opencode accepts JSONC, and CodeGraph writes strict JSON; users may keep comments. Strip comments
 * and trailing commas while respecting string literals so a `https://` URL is never mistaken for one.
 */
function parseJsonc(text: string): unknown {
  let stripped = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inLine) {
      if (char === "\n") {
        inLine = false;
        stripped += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      stripped += char;
      if (char === "\\") {
        stripped += next ?? "";
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      stripped += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      index += 1;
      continue;
    }
    stripped += char;
  }
  return JSON.parse(stripped.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * CodeGraph 1.6.2 writes the wrong opencode shape (`mcp.servers` with `disabled`/`codemode`).
 * Normalize it to opencode's real schema (`mcp.<name>` with `type`, `command`, `enabled`) and point
 * the server at the pinned release.
 */
export async function wireOpencodeMcp(): Promise<"wired" | "unchanged" | "skipped"> {
  const directory = resolve(homedir(), ".config", "opencode");
  if (!(await pathExists(directory))) return "skipped";
  let path: string | undefined;
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const candidate = resolve(directory, name);
    if (await pathExists(candidate)) {
      path = candidate;
      break;
    }
  }
  if (!path) return "skipped";

  let parsed: unknown;
  try {
    parsed = parseJsonc(await Bun.file(path).text());
  } catch (error) {
    process.stderr.write(
      `CodeGraph could not update ${path}: ${error instanceof Error ? error.message : String(error)}. Add an mcp.codegraph entry manually.\n`,
    );
    return "skipped";
  }
  const config = asObject(parsed);
  if (!config) return "skipped";
  const mcp = asObject(config.mcp) ?? {};
  const command = codegraphMcpCommand();
  const current = asObject(mcp.codegraph);
  const currentCommand = current && Array.isArray(current.command) ? (current.command as unknown[]) : undefined;
  const valid =
    current?.type === "local" &&
    current.enabled !== false &&
    currentCommand?.length === command.length &&
    currentCommand.every((part, index) => part === command[index]);
  const servers = asObject(mcp.servers);
  const staleServers = servers !== undefined && Object.keys(servers).every((key) => key === "codegraph");
  if (valid && !staleServers) return "unchanged";

  const nextMcp: JsonObject = { ...mcp, codegraph: { type: "local", command, enabled: true } };
  if (staleServers) delete nextMcp.servers;
  await mkdir(directory, { recursive: true });
  await Bun.write(path, `${JSON.stringify({ ...config, mcp: nextMcp }, null, 2)}\n`);
  process.stdout.write(`CodeGraph MCP server wired for opencode in ${path}.\n`);
  return "wired";
}

/** Align a developer's global `codegraph` with the pinned release so bare commands stay on 1.6.2. */
async function alignGlobalCli(): Promise<void> {
  let version: string | undefined;
  try {
    const probe = Bun.spawnSync(["codegraph", "--version"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (probe.exitCode !== 0) return;
    version = probe.stdout.toString().trim().split(/\s+/).pop();
  } catch {
    return;
  }
  if (!version || version === CODEGRAPH_VERSION) return;
  await tryRun(["codegraph", "upgrade", CODEGRAPH_VERSION], "CodeGraph CLI upgrade");
}

/** Keeps the local CodeGraph index complete; `init` runs this, `ai:update` does not. */
export async function syncCodegraphIndex(): Promise<void> {
  if (await Bun.file(codegraphDatabase).exists()) {
    await runWithLockRetry(codegraphCommand("sync", root), "CodeGraph index sync");
  } else {
    await runWithLockRetry(codegraphCommand("init", "--yes", root), "CodeGraph index initialization");
  }
}

/** Installs every required project skill; already installed skills are left untouched. */
export async function installAgentSkills(): Promise<void> {
  for (const source of AGENT_SKILL_SOURCES) {
    const missing = await Promise.all(
      source.skills.map(async (skill) =>
        (await Bun.file(resolve(root, `.agents/skills/${skill}/SKILL.md`)).exists()) ? undefined : skill,
      ),
    ).then((skills) => skills.filter((skill): skill is NonNullable<typeof skill> => skill !== undefined));

    if (missing.length === 0) {
      process.stdout.write(`Required skills from ${source.repository} are already installed.\n`);
      continue;
    }

    await run(
      [
        "bunx",
        "--bun",
        `skills@${SKILLS_CLI_VERSION}`,
        "add",
        source.repository,
        "--skill",
        ...missing,
        "--agent",
        "codex",
        "--copy",
        "--yes",
      ],
      `${source.repository} skills setup`,
    );

    const installed = await Promise.all(
      missing.map((skill) => Bun.file(resolve(root, `.agents/skills/${skill}/SKILL.md`)).exists()),
    );
    if (installed.some((ready) => !ready)) {
      throw new Error(`Required skills from ${source.repository} were not installed: ${missing.join(", ")}`);
    }
  }
}

/**
 * The CodeGraph MCP wiring and the project skills — the parts `bun erp ai:update` re-syncs.
 * `init` additionally builds the local index through `initializeAgentTooling`.
 */
export async function updateAgentTooling(): Promise<void> {
  // CI has no interactive agent, and wiring global config there would be noise.
  if (!process.env.CI) {
    await alignGlobalCli();
    await tryRun(
      codegraphCommand("install", "--target", "auto", "--location", "global", "--yes"),
      "CodeGraph agent wiring",
    );
    await wireOpencodeMcp();
  }
  await installAgentSkills();
}

/** Full `bun erp init` agent setup: build the index, then wire MCP and skills. */
export async function initializeAgentTooling(): Promise<void> {
  await syncCodegraphIndex();
  await updateAgentTooling();
  process.stdout.write(
    `Agent skills are installed, CodeGraph ${CODEGRAPH_VERSION} indexes the project, and detected agents are wired for its MCP server.\n`,
  );
}

if (import.meta.main) await initializeAgentTooling();
