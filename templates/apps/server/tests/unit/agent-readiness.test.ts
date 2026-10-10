import { expect, test } from "bun:test";
import { type AgentReadinessInput, evaluateAgentReadiness } from "@cli/gates/agent-readiness.ts";
import { REQUIRED_AGENT_SKILLS } from "@cli/gates/agent-skills.ts";
import { CODEGRAPH_VERSION } from "@cli/gates/codegraph.ts";
import { repoRoot } from "@cli/lib/repo.ts";

const BASE: AgentReadinessInput = {
  installedSkills: [...REQUIRED_AGENT_SKILLS],
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
    ...REQUIRED_AGENT_SKILLS.map((skill) => `Install the project skill .agents/skills/${skill}.`),
    "CodeGraph index is unavailable: missing database",
    "CodeGraph has not indexed apps/server/http/app.ts; run bun loom init.",
    "CodeGraph has not indexed apps/web/src/main.tsx; run bun loom init.",
    "CodeGraph index is incomplete; run bun loom init.",
  ]);
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
