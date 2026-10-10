import { expect, test } from "bun:test";
import { type AgentReadinessInput, evaluateAgentReadiness } from "@cli/gates/agent-readiness.ts";
import { AGENT_SKILL_DIRS, missingAgentSkills, REQUIRED_AGENT_SKILLS } from "@cli/gates/agent-skills.ts";
import { CODEGRAPH_VERSION } from "@cli/gates/codegraph.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { skillsAddArgv } from "@cli/tasks/init-agents.ts";
import { withTempRoot } from "./support/temp-root.ts";

const ALL_SKILL_PATHS = AGENT_SKILL_DIRS.flatMap((dir) => REQUIRED_AGENT_SKILLS.map((skill) => `${dir}/${skill}`));

const BASE: AgentReadinessInput = {
  installedSkills: ALL_SKILL_PATHS,
  indexedFiles: [
    "apps/server/http/app.ts",
    "apps/web/src/main.tsx",
    ...Array.from({ length: 30 }, (_, index) => `src/${index}.ts`),
  ],
  indexVersion: CODEGRAPH_VERSION,
  templateMode: false,
  guidelinesBlock: "<!-- guidelines:start -->\n- Apps: `server` (`@loom/server`)\n<!-- guidelines:end -->",
};

test("agent readiness accepts installed startup skills, a complete index, and the pinned version", () => {
  expect(evaluateAgentReadiness(BASE)).toEqual([]);
});

test("agent readiness reports missing prerequisites with an actionable setup command", () => {
  expect(
    evaluateAgentReadiness({
      ...BASE,
      installedSkills: [],
      indexedFiles: [],
      indexError: "missing database",
    }),
  ).toEqual([
    ...ALL_SKILL_PATHS.map((path) => `Install the project skill ${path}; run bun loom ai:skills.`),
    "CodeGraph index is unavailable: missing database",
    "CodeGraph has not indexed apps/server/http/app.ts; run bun loom init.",
    "CodeGraph has not indexed apps/web/src/main.tsx; run bun loom init.",
    "CodeGraph index is incomplete; run bun loom init.",
  ]);
});

test("every agent reads skills from its own directory, so each one must hold every skill", () => {
  expect([...AGENT_SKILL_DIRS]).toEqual([".agents/skills", ".claude/skills"]);
  expect(
    evaluateAgentReadiness({
      ...BASE,
      installedSkills: ALL_SKILL_PATHS.filter((path) => path !== ".claude/skills/diagram-design"),
    }),
  ).toEqual(["Install the project skill .claude/skills/diagram-design; run bun loom ai:skills."]);
});

test("a skill installed for one agent only is still missing for the other", async () => {
  const files = {
    ".agents/skills/tdd/SKILL.md": "---\nname: tdd\n---\n",
    ".claude/skills/grill-me/SKILL.md": "---\nname: grill-me\n---\n",
  };
  await withTempRoot(files, async (root) => {
    expect(await missingAgentSkills(root, ["tdd", "grill-me"])).toEqual([
      ".agents/skills/grill-me",
      ".claude/skills/tdd",
    ]);
  });
});

test("the installer copies skills for Codex and Claude Code in one run", () => {
  const argv = skillsAddArgv("cathrynlavery/diagram-design", ["diagram-design"]);
  const agentIndex = argv.indexOf("--agent");
  expect(argv.slice(agentIndex, agentIndex + 3)).toEqual(["--agent", "codex", "claude-code"]);
  expect(argv).toContain("--copy");
  expect(argv.slice(argv.indexOf("--skill"), argv.indexOf("--skill") + 2)).toEqual(["--skill", "diagram-design"]);
});

test("agent readiness flags an index built by a CLI that drifts from the pinned version", () => {
  expect(evaluateAgentReadiness({ ...BASE, indexVersion: "1.5.0" })).toEqual([
    `CodeGraph indexed this project with 1.5.0; the project pins ${CODEGRAPH_VERSION}. Run bun loom init.`,
  ]);
});

test("agent readiness flags an index that records no CLI version", () => {
  expect(evaluateAgentReadiness({ ...BASE, indexVersion: undefined })).toEqual([
    "CodeGraph index does not record its version; run bun loom init.",
  ]);
});

test("template mode ignores the state-neutral guidelines block", () => {
  expect(evaluateAgentReadiness({ ...BASE, templateMode: true, guidelinesBlock: undefined })).toEqual([]);
  expect(evaluateAgentReadiness({ ...BASE, templateMode: true, guidelinesBlock: "neutral" })).toEqual([]);
});

test("project mode requires the guidelines block generated for the installed catalog", () => {
  expect(evaluateAgentReadiness({ ...BASE, guidelinesBlock: undefined })).toEqual([
    "AGENTS.md has no guidelines block; run bun loom ai:update.",
  ]);
  expect(
    evaluateAgentReadiness({
      ...BASE,
      guidelinesBlock: "<!-- guidelines:start -->\nstate-neutral\n<!-- guidelines:end -->",
    }),
  ).toEqual(["AGENTS.md guidelines block is not generated for this project; run bun loom ai:update."]);
});

const FLOW_SKILLS = [
  "grill-me",
  "grill-with-docs",
  "domain-modeling",
  "to-spec",
  "to-tickets",
  "tdd",
  "implement",
  "code-review",
  "diagnosing-bugs",
  "codebase-design",
];

test("required skills cover the planning-to-delivery flow", () => {
  for (const skill of FLOW_SKILLS) expect(REQUIRED_AGENT_SKILLS).toContain(skill as never);
});

test("the issue tracker config sends tickets to docs/tasks, not GitHub Issues or .scratch", async () => {
  const root = `${repoRoot}/`;
  const tracker = await Bun.file(`${root}docs/agents/issue-tracker.md`).text();
  expect(tracker).toContain("docs/tasks/");
  expect(tracker).toContain("bun loom task:new");
  expect(tracker).toContain("depends_on");
  expect(tracker).not.toMatch(/gh issue create/);
  const agents = await Bun.file(`${root}AGENTS.md`).text();
  expect(agents).toContain("docs/agents/issue-tracker.md");
});

test("agent instructions state the six-phase flow and where each phase is enforced", async () => {
  const root = `${repoRoot}/`;
  const flow = "brainstorm → plan → design → execute → review → iterate";
  const agents = await Bun.file(`${root}AGENTS.md`).text();
  expect(agents).toContain(flow);
  expect(agents).toContain("docs/design/<id>/");
  const skills = await Bun.file(`${root}skills/README.md`).text();
  expect(skills).toContain(flow);
  for (const skill of ["grill-with-docs", "to-tickets", "diagram-design", "impeccable", "tdd", "code-review"]) {
    expect(skills).toContain(skill);
  }
  const tracker = await Bun.file(`${root}docs/agents/issue-tracker.md`).text();
  for (const fragment of ["## Flow", "bun loom task:plan", "--depends-on", "docs/design/"])
    expect(tracker).toContain(fragment);
  const gates = await Bun.file(`${root}docs/gates.md`).text();
  expect(gates).toContain("## Delivery flow (`## Flow`)");
  const development = await Bun.file(`${root}docs/development.md`).text();
  for (const fragment of [".claude/skills", "bun loom ai:skills", ".claude/settings.json"])
    expect(development).toContain(fragment);
});
