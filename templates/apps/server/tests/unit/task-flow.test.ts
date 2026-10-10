import { expect, test } from "bun:test";
import { FLOW_PHASES, loadDesignPacks, loadTasks, validateTasks } from "@cli/gates/tasks.ts";
import { withTempRoot } from "./support/temp-root.ts";

/** The first `done` phases are ticked with a note; the rest are open. */
const flow = (done: number) =>
  FLOW_PHASES.map((phase, index) => (index < done ? `- [x] ${phase}: ${phase} note` : `- [ ] ${phase}:`)).join("\n");

const owner = (id: string, options: { status?: string; done?: number; body?: string } = {}) =>
  `---\nid: ${id}\ntitle: Owner ${id}\nstatus: ${options.status ?? "in_progress"}\n---\n\n## Flow\n\n${flow(options.done ?? 0)}\n\n## Plan\n\nWave 1: tickets\n${options.body ?? ""}`;

const ticket = (id: string, options: { status?: string; dependsOn?: string; checkpoints?: string } = {}) =>
  `---\nid: ${id}\ntitle: Ticket ${id}\nstatus: ${options.status ?? "draft"}\n${options.dependsOn ? `depends_on: ${options.dependsOn}\n` : ""}---\n\n## Checkpoints\n\n${options.checkpoints ?? `- [ ] **${id}.1** smallest step`}\n`;

const NA_PACK = (id: string) => ({
  [`docs/design/${id}/system.md`]: `# ${id} — Design system\n\nn/a — no UI\n`,
  [`docs/design/${id}/database.md`]: `# ${id} — Database\n\nn/a — no tables\n`,
  [`docs/design/${id}/pages.md`]: `# ${id} — Pages\n\nn/a — no pages\n`,
  [`docs/design/${id}/flow.html`]: "<svg></svg>",
});

async function findings(files: Record<string, string>): Promise<string[]> {
  let result: string[] = [];
  await withTempRoot(files, async (root) => {
    const tasks = await loadTasks(`${root}/docs/tasks`);
    const found = validateTasks(tasks, await loadDesignPacks(`${root}/docs/design`, tasks));
    result = found.map((finding) => `${finding.file}: ${finding.message}`);
  });
  return result;
}

test("every owner task carries the six phases in order", async () => {
  const missing = await findings({
    "docs/tasks/S1-x.md": "---\nid: S1\ntitle: X\nstatus: in_progress\n---\n\n## Goal\n",
  });
  expect(missing.join("\n")).toContain('S1-x.md: flow: add a "## Flow" section');
  const reordered = owner("S2").replace("- [ ] plan:\n- [ ] design:", "- [ ] design:\n- [ ] plan:");
  expect((await findings({ "docs/tasks/S2-x.md": reordered })).join("\n")).toContain('add a "## Flow" section');
  expect(await findings({ "docs/tasks/S3-x.md": owner("S3") })).toEqual([]);
});

test("a ticked phase needs a note and every earlier phase ticked", async () => {
  const noNote = owner("S1").replace("- [ ] brainstorm:", "- [x] brainstorm:");
  expect(await findings({ "docs/tasks/S1-x.md": noNote })).toContain(
    "S1-x.md: flow: brainstorm is ticked without a note — say what the phase produced",
  );
  const skipped = owner("S1").replace("- [ ] design:", "- [x] design: drew it");
  expect((await findings({ "docs/tasks/S1-x.md": skipped, ...NA_PACK("S1") })).join("\n")).toContain(
    "flow: design is ticked before brainstorm",
  );
});

test("tickets and checkpoints wait for the owner's design phase", async () => {
  const early = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 2 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1", { status: "in_progress" }),
    "docs/tasks/S1.2-b.md": ticket("S1.2", { checkpoints: "- [x] **S1.2.1** done already" }),
  });
  expect(early).toContain(
    "S1.1-a.md: cannot be in_progress before S1 ticks design — finish brainstorm, plan and design there first",
  );
  expect(early).toContain("S1.2-b.md: checkpoints are ticked before S1 ticks design");
  const ownerEarly = await findings({ "docs/tasks/S2-x.md": owner("S2", { body: "\n- [x] **S2.1** shortcut\n" }) });
  expect(ownerEarly).toContain("S2-x.md: checkpoints are ticked before S2 ticks design");
  const ready = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 3 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1", { status: "in_progress" }),
    ...NA_PACK("S1"),
  });
  expect(ready).toEqual([]);
});

test("a ticked design phase needs the full design pack", async () => {
  const empty = await findings({ "docs/tasks/S1-x.md": owner("S1", { done: 3 }) });
  for (const file of ["system.md", "database.md", "pages.md"]) {
    expect(empty).toContain(`S1-x.md: design: docs/design/S1/${file} is missing`);
  }
  expect(empty).toContain(
    "S1-x.md: design: docs/design/S1/flow.html is missing — draw it with the diagram-design skill",
  );

  const partial = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 3 }),
    ...NA_PACK("S1"),
    "docs/design/S1/database.md": [
      "# S1 — Database",
      "## Entities\n\ninvoices: id uuid, total numeric",
      "## Relationships\n\n<!-- guidance only -->",
      "## Indexes and constraints\n\nunique(number)",
      "## Migrations\n\n0001 create invoices",
      "## Access patterns\n\nlist by date",
    ].join("\n\n"),
  });
  expect(partial).toContain(
    'S1-x.md: design: docs/design/S1/database.md needs "## Relationships" with content, or "n/a — <reason>" for the whole document',
  );
  expect(partial).toContain(
    "S1-x.md: design: docs/design/S1/database.html is missing — draw it with the diagram-design skill",
  );
});

test("a ticked plan needs a plan section and a checkpoint in every ticket", async () => {
  const result = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 2 }).replace("## Plan\n\nWave 1: tickets\n", ""),
    "docs/tasks/S1.1-a.md": ticket("S1.1", { checkpoints: "Nothing yet" }),
  });
  expect(result).toContain('S1-x.md: flow: plan is ticked without a "## Plan" section — paste bun loom task:plan S1');
  expect(result).toContain(
    "S1-x.md: flow: plan is ticked but S1.1 has no checkpoint — split it into the smallest verifiable steps",
  );
  const fenced = owner("S3", { done: 2, body: "\n## Checkpoints\n\n- [ ] **S3.1** step\n" }).replace(
    "Wave 1: tickets",
    "```text\nWave 1: S3.1\n```",
  );
  expect(await findings({ "docs/tasks/S3-x.md": fenced })).toEqual([]);
  const bare = await findings({ "docs/tasks/S2-x.md": owner("S2", { done: 2 }) });
  expect(bare).toContain("S2-x.md: flow: plan is ticked but there are no tickets or checkpoints");
});

test("execute needs every checkpoint ticked, and approval needs every phase", async () => {
  const result = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 4 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1", {
      status: "in_progress",
      checkpoints: "- [x] **S1.1.1** a\n- [ ] **S1.1.2** b",
    }),
    ...NA_PACK("S1"),
  });
  expect(result).toContain("S1-x.md: flow: execute is ticked but S1.1 has unticked checkpoints");

  const approved = owner("S2", { status: "ready", done: 5, body: "\n- [x] **S2.1** done\n" }).replace(
    "status: ready",
    "status: ready\napproved_by: Reviewer\nevidence: bun loom check",
  );
  expect(await findings({ "docs/tasks/S2-x.md": approved, ...NA_PACK("S2") })).toContain(
    'S2-x.md: status "ready" requires every flow phase ticked',
  );
});

test("unstarted tickets may depend on unstarted tickets; started ones and cycles may not", async () => {
  const planned = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 3 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1"),
    "docs/tasks/S1.2-b.md": ticket("S1.2", { dependsOn: "S1.1" }),
    ...NA_PACK("S1"),
  });
  expect(planned).toEqual([]);

  const started = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 3 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1"),
    "docs/tasks/S1.2-b.md": ticket("S1.2", { status: "in_progress", dependsOn: "S1.1" }),
    ...NA_PACK("S1"),
  });
  expect(started).toContain('S1.2-b.md: depends_on "S1.1" is draft — not started');

  const cycle = await findings({
    "docs/tasks/S1-x.md": owner("S1", { done: 3 }),
    "docs/tasks/S1.1-a.md": ticket("S1.1", { dependsOn: "S1.2" }),
    "docs/tasks/S1.2-b.md": ticket("S1.2", { dependsOn: "S1.1" }),
    ...NA_PACK("S1"),
  });
  expect(cycle).toContain("S1.1-a.md: depends_on cycle: S1.1 → S1.2 → S1.1");
});
