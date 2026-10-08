import { expect, test } from "bun:test";
import { type AgentReadinessInput, evaluateAgentReadiness } from "@cli/gates/agent-readiness.ts";
import { REQUIRED_AGENT_SKILLS } from "@cli/gates/agent-skills.ts";
import { CODEGRAPH_VERSION } from "@cli/gates/codegraph.ts";

const BASE: AgentReadinessInput = {
  installedSkills: [...REQUIRED_AGENT_SKILLS],
  indexedFiles: [
    "apps/server/http/app.ts",
    "apps/web/src/main.tsx",
    ...Array.from({ length: 30 }, (_, index) => `src/${index}.ts`),
  ],
  indexVersion: CODEGRAPH_VERSION,
  templateMode: false,
  guidelinesBlock: "<!-- guidelines:start -->\n- Apps: `server` (`@bun-erp/server`)\n<!-- guidelines:end -->",
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
    "CodeGraph has not indexed apps/server/http/app.ts; run bun erp init.",
    "CodeGraph has not indexed apps/web/src/main.tsx; run bun erp init.",
    "CodeGraph index is incomplete; run bun erp init.",
  ]);
});

test("agent readiness flags an index built by a CLI that drifts from the pinned version", () => {
  expect(evaluateAgentReadiness({ ...BASE, indexVersion: "1.5.0" })).toEqual([
    `CodeGraph indexed this project with 1.5.0; the project pins ${CODEGRAPH_VERSION}. Run bun erp init.`,
  ]);
});

test("agent readiness flags an index that records no CLI version", () => {
  expect(evaluateAgentReadiness({ ...BASE, indexVersion: undefined })).toEqual([
    "CodeGraph index does not record its version; run bun erp init.",
  ]);
});

test("template mode ignores the state-neutral guidelines block", () => {
  expect(evaluateAgentReadiness({ ...BASE, templateMode: true, guidelinesBlock: undefined })).toEqual([]);
  expect(evaluateAgentReadiness({ ...BASE, templateMode: true, guidelinesBlock: "neutral" })).toEqual([]);
});

test("project mode requires the guidelines block generated for the installed catalog", () => {
  expect(evaluateAgentReadiness({ ...BASE, guidelinesBlock: undefined })).toEqual([
    "AGENTS.md has no guidelines block; run bun erp ai:update.",
  ]);
  expect(
    evaluateAgentReadiness({
      ...BASE,
      guidelinesBlock: "<!-- guidelines:start -->\nstate-neutral\n<!-- guidelines:end -->",
    }),
  ).toEqual(["AGENTS.md guidelines block is not generated for this project; run bun erp ai:update."]);
});
