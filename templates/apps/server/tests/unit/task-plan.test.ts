import { expect, test } from "bun:test";
import {
  DESIGN_DOCUMENTS,
  formatPlan,
  loadDesignPacks,
  loadTasks,
  planWaves,
  type Task,
  validateTasks,
} from "@cli/gates/tasks.ts";
import { renderDesignDocument, renderOwnerTask, renderTicket } from "@cli/lib/task-templates.ts";
import { withTempRoot } from "./support/temp-root.ts";

const ticket = (id: string, dependsOn = "") =>
  `---\nid: ${id}\ntitle: Ticket ${id}\nstatus: draft\n${dependsOn ? `depends_on: ${dependsOn}\n` : ""}---\n\n- [ ] **${id}.1** step\n`;

/** Owner S1 plus the given tickets, loaded the way the gate loads them. */
async function withPlan(tickets: Record<string, string>, use: (owner: Task, tasks: Task[]) => void): Promise<void> {
  await withTempRoot({ "docs/tasks/S1-owner.md": renderOwnerTask("S1", "Owner"), ...tickets }, async (root) => {
    const tasks = await loadTasks(`${root}/docs/tasks`);
    const owner = tasks.find((task) => task.id === "S1");
    if (!owner) throw new Error("owner missing");
    use(owner, tasks);
  });
}

test("waves group tickets whose dependencies all sit in earlier waves", async () => {
  const tickets = {
    "docs/tasks/S1.1-a.md": ticket("S1.1"),
    "docs/tasks/S1.2-b.md": ticket("S1.2", "S9"),
    "docs/tasks/S1.3-c.md": ticket("S1.3", "S1.1"),
    "docs/tasks/S1.10-d.md": ticket("S1.10", "S1.2, S1.3"),
  };
  await withPlan(tickets, (owner, tasks) => {
    expect(planWaves(owner, tasks).map((wave) => wave.map((task) => task.id))).toEqual([
      ["S1.1", "S1.2"],
      ["S1.3"],
      ["S1.10"],
    ]);
    expect(formatPlan(owner, tasks)).toBe(
      [
        "S1 — Owner",
        "Wave 1 (parallel): S1.1 Ticket S1.1 · S1.2 Ticket S1.2",
        "Wave 2: S1.3 Ticket S1.3",
        "Wave 3: S1.10 Ticket S1.10",
        "",
      ].join("\n"),
    );
  });
});

test("a dependency cycle cannot be planned", async () => {
  const tickets = { "docs/tasks/S1.1-a.md": ticket("S1.1", "S1.2"), "docs/tasks/S1.2-b.md": ticket("S1.2", "S1.1") };
  await withPlan(tickets, (owner, tasks) => {
    expect(() => planWaves(owner, tasks)).toThrow("depends_on cycle among S1.1, S1.2");
  });
});

test("the owner, ticket and design scaffolds pass the gate as written", async () => {
  const files: Record<string, string> = {
    "docs/tasks/S12-invoices.md": renderOwnerTask("S12", "Invoices"),
    "docs/tasks/S12.1-list.md": renderTicket("S12.1", "List invoices", []),
    "docs/tasks/S12.2-approve.md": renderTicket("S12.2", "Approve an invoice", ["S12.1"]),
  };
  for (const file of Object.keys(DESIGN_DOCUMENTS))
    files[`docs/design/S12/${file}`] = renderDesignDocument("S12", file);
  await withTempRoot(files, async (root) => {
    const tasks = await loadTasks(`${root}/docs/tasks`);
    expect(validateTasks(tasks, await loadDesignPacks(`${root}/docs/design`, tasks))).toEqual([]);
    expect(tasks.find((task) => task.id === "S12.2")?.dependsOn).toEqual(["S12.1"]);
    expect(tasks.find((task) => task.id === "S12.2")?.status).toBe("draft");
  });
  for (const [file, headings] of Object.entries(DESIGN_DOCUMENTS)) {
    for (const heading of headings) expect(renderDesignDocument("S12", file)).toContain(`\n## ${heading}\n`);
  }
});

test("scaffold placeholders do not count as a plan or a design", async () => {
  const owner = renderOwnerTask("S12", "Invoices")
    .replace("- [ ] brainstorm:", "- [x] brainstorm: decided")
    .replace("- [ ] plan:", "- [x] plan: planned")
    .replace("- [ ] design:", "- [x] design: designed");
  const files: Record<string, string> = { "docs/tasks/S12-invoices.md": owner };
  for (const file of Object.keys(DESIGN_DOCUMENTS))
    files[`docs/design/S12/${file}`] = renderDesignDocument("S12", file);
  await withTempRoot(files, async (root) => {
    const tasks = await loadTasks(`${root}/docs/tasks`);
    const findings = validateTasks(tasks, await loadDesignPacks(`${root}/docs/design`, tasks)).map((f) => f.message);
    expect(findings).toContain('flow: plan is ticked without a "## Plan" section — paste bun loom task:plan S12');
    expect(findings).toContain(
      'design: docs/design/S12/system.md needs "## Foundations" with content, or "n/a — <reason>" for the whole document',
    );
    expect(findings).toContain("design: docs/design/S12/flow.html is missing — draw it with the diagram-design skill");
  });
});
