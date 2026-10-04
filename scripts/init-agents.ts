import { resolve } from "node:path";

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

const requiredSkills = ["grill-me", "grilling"] as const;
const skillFiles = requiredSkills.map((skill) => resolve(root, `.agents/skills/${skill}/SKILL.md`));
if (await Promise.all(skillFiles.map((file) => Bun.file(file).exists())).then((results) => results.every(Boolean))) {
  process.stdout.write("Required Matthew Pocock skills are already installed.\n");
} else {
  await run(
    [
      "bunx",
      "--bun",
      `skills@${SKILLS_CLI_VERSION}`,
      "add",
      "mattpocock/skills",
      "--skill",
      ...requiredSkills,
      "--agent",
      "codex",
      "--copy",
      "--yes",
    ],
    "Matthew Pocock skills setup",
  );
  const installed = await Promise.all(skillFiles.map((file) => Bun.file(file).exists()));
  if (installed.some((ready) => !ready)) throw new Error("Required grill-me skills were not installed");
}

process.stdout.write("Agent skills are installed and the current project is indexed by CodeGraph.\n");
