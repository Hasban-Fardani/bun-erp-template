import { resolve } from "node:path";
import { AGENT_SKILL_SOURCES } from "../tools/agent-skills.ts";

const root = resolve(import.meta.dir, "..");
const CODEGRAPH_VERSION = "1.6.2";
const SKILLS_CLI_VERSION = "1.7.0";
const codegraphDatabase = resolve(root, ".codegraph/codegraph.db");

async function run(argv: string[], label: string): Promise<void> {
  const child = Bun.spawn(argv, { cwd: root, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${label} failed with exit ${code}`);
}

if (await Bun.file(codegraphDatabase).exists()) {
  await run(["bunx", "--bun", `@colbymchenry/codegraph@${CODEGRAPH_VERSION}`, "sync", root], "CodeGraph index sync");
} else {
  await run(
    ["bunx", "--bun", `@colbymchenry/codegraph@${CODEGRAPH_VERSION}`, "init", "--yes", root],
    "CodeGraph index initialization",
  );
}

for (const source of AGENT_SKILL_SOURCES) {
  const missing = await Promise.all(
    source.skills.map(async (skill) =>
      (await Bun.file(resolve(root, `.agents/skills/${skill}/SKILL.md`)).exists()) ? undefined : skill,
    ),
  ).then((skills) => skills.filter((skill): skill is string => skill !== undefined));

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

process.stdout.write("Agent skills are installed and the current project is indexed by CodeGraph.\n");
