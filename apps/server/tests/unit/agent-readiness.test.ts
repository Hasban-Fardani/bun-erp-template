import { expect, test } from "bun:test";
import { evaluateAgentReadiness } from "../../../../tools/agent-readiness.ts";
import { REQUIRED_AGENT_SKILLS } from "../../../../tools/agent-skills.ts";

test("agent readiness accepts installed startup skills and a complete multi-app CodeGraph index", () => {
  expect(
    evaluateAgentReadiness({
      installedSkills: [...REQUIRED_AGENT_SKILLS],
      indexedFiles: [
        "apps/server/http/app.ts",
        "apps/web/src/main.tsx",
        "apps/mobile/src/main.tsx",
        ...Array.from({ length: 30 }, (_, index) => `src/${index}.ts`),
      ],
    }),
  ).toEqual([]);
});

test("agent readiness reports missing prerequisites with an actionable setup command", () => {
  expect(evaluateAgentReadiness({ installedSkills: [], indexedFiles: [], indexError: "missing database" })).toEqual([
    ...REQUIRED_AGENT_SKILLS.map((skill) => `Install the project skill .agents/skills/${skill}.`),
    "CodeGraph index is unavailable: missing database",
    "CodeGraph has not indexed apps/server/http/app.ts; run bun erp init.",
    "CodeGraph has not indexed apps/web/src/main.tsx; run bun erp init.",
    "CodeGraph has not indexed apps/mobile/src/main.tsx; run bun erp init.",
    "CodeGraph index is incomplete; run bun erp init.",
  ]);
});
