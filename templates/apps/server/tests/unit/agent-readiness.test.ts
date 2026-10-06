import { expect, test } from "bun:test";
import { type AgentReadinessInput, evaluateAgentReadiness } from "../../../../cli/gates/agent-readiness.ts";
import { REQUIRED_AGENT_SKILLS } from "../../../../cli/gates/agent-skills.ts";
import { CODEGRAPH_VERSION } from "../../../../cli/gates/codegraph.ts";

const BASE: AgentReadinessInput = {
  installedSkills: [...REQUIRED_AGENT_SKILLS],
  indexedFiles: [
    "apps/server/http/app.ts",
    "apps/web/src/main.tsx",
    ...Array.from({ length: 30 }, (_, index) => `src/${index}.ts`),
  ],
  cliVersion: CODEGRAPH_VERSION,
};

test("agent readiness accepts installed startup skills, a complete index, and the pinned CLI", () => {
  expect(evaluateAgentReadiness(BASE)).toEqual([]);
});

test("agent readiness reports missing prerequisites with an actionable setup command", () => {
  expect(
    evaluateAgentReadiness({
      ...BASE,
      installedSkills: [],
      indexedFiles: [],
      indexError: "missing database",
      cliError: "command not found",
    }),
  ).toEqual([
    ...REQUIRED_AGENT_SKILLS.map((skill) => `Install the project skill .agents/skills/${skill}.`),
    "CodeGraph index is unavailable: missing database",
    "CodeGraph CLI is unavailable: command not found",
    "CodeGraph has not indexed apps/server/http/app.ts; run bun erp init.",
    "CodeGraph has not indexed apps/web/src/main.tsx; run bun erp init.",
    "CodeGraph index is incomplete; run bun erp init.",
  ]);
});

test("agent readiness flags a CodeGraph CLI that drifts from the pinned version", () => {
  expect(evaluateAgentReadiness({ ...BASE, cliVersion: "1.5.0" })).toEqual([
    `CodeGraph CLI reports 1.5.0; the project pins ${CODEGRAPH_VERSION}. Run bun erp init.`,
  ]);
});
