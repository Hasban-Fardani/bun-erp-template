import { expect, test } from "bun:test";
import { checkTaskEvidence, FLOW_PHASES, loadDesignPacks, loadTasks, validateTasks } from "@cli/gates/tasks.ts";

const GOOD = [
  "## Evidence",
  "",
  "- red: T1 `bun test a.test.ts` — 1 fail: expected 2, received 1",
  "- green: T1 `bun test a.test.ts` — 1 pass",
  "- red: T2 n/a — docs only, nothing executable",
  "- green: T2 `bun loom check:docs` — Docs OK",
].join("\n");

const items = (...ids: string[]) => ids.map((id) => `- [x] **${id}** work`).join("\n");

test("ticked items with red and green lines pass", () => {
  expect(checkTaskEvidence(`${items("T1", "T2")}\n\n${GOOD}`)).toEqual([]);
});

test("a ticked item without evidence is a finding", () => {
  expect(checkTaskEvidence(`${items("T1", "T9")}\n\n${GOOD}`).join("\n")).toContain("T9");
});

test("green without a preceding red is a finding", () => {
  const body = `${items("T1")}\n\n## Evidence\n\n- green: T1 \`bun test\` — 1 pass\n- red: T1 \`bun test\` — 1 fail`;
  expect(checkTaskEvidence(body).join("\n")).toContain("green before red");
});

test("a line without a backticked command and output is rejected", () => {
  const body = `${items("T1")}\n\n## Evidence\n\n- red: T1 it failed\n- green: T1 \`bun test\``;
  expect(checkTaskEvidence(body).join("\n")).toMatch(/red line needs[\s\S]*green/);
});

test("red n/a needs a reason and is not allowed on green", () => {
  const body = `${items("T1")}\n\n## Evidence\n\n- red: T1 n/a —\n- green: T1 n/a — nope`;
  expect(checkTaskEvidence(body).join("\n")).toMatch(/non-empty reason[\s\S]*green line needs/);
});

test("NOT_RUN and BLOCKED items must not be ticked", () => {
  const body = `${items("T1")}\n\n## Evidence\n\n- red: T1 NOT_RUN — no database`;
  expect(checkTaskEvidence(body).join("\n")).toContain("NOT_RUN");
  expect(checkTaskEvidence("- [x] **T3** BLOCKED on infra\n\n## Evidence\n").join("\n")).toContain("BLOCKED");
});

test("unticked items and fenced examples are ignored", () => {
  const body = "- [ ] **T1** later\n\n## Evidence\n\n```\n- green: T1 oops\n```\n";
  expect(checkTaskEvidence(body)).toEqual([]);
});

test("only tasks with tdd: required are checked", async () => {
  const dir = `/tmp/erp-task-evidence-${crypto.randomUUID()}`;
  const flow = FLOW_PHASES.map((phase, index) => `- [${index < 3 ? "x" : " "}] ${phase}: done`).join("\n");
  const doc = (id: string, tdd: string) =>
    `---\nid: ${id}\ntitle: X\nstatus: in_progress\n${tdd}---\n\n## Flow\n\n${flow}\n\n## Plan\n\nOne step\n\n- [x] **T1** done\n\n## Evidence\n`;
  for (const id of ["A", "B"]) {
    for (const file of ["system.md", "database.md", "pages.md"])
      await Bun.write(`${dir}/design/${id}/${file}`, "n/a — none\n");
    await Bun.write(`${dir}/design/${id}/flow.html`, "<svg></svg>");
  }
  await Bun.write(`${dir}/tasks/A-required.md`, doc("A", "tdd: required\n"));
  await Bun.write(`${dir}/tasks/B-legacy.md`, doc("B", ""));
  const tasks = await loadTasks(`${dir}/tasks`);
  const findings = validateTasks(tasks, await loadDesignPacks(`${dir}/design`, tasks));
  expect([...new Set(findings.map((f) => f.file))]).toEqual(["A-required.md"]);
  await Bun.$`rm -rf ${dir}`;
});
