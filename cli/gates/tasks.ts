import { join } from "node:path";

/** F1.11 — ready/done require approved_by + evidence; an agent cannot raise them silently. */
export const TASK_STATUSES = ["draft", "blocked", "ready", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses that require recorded human approval. */
const HUMAN_APPROVAL_REQUIRED: readonly TaskStatus[] = ["ready", "done"];

/** Work has begun; `draft` and `blocked` have not started. */
const STARTED: readonly TaskStatus[] = ["in_progress", "ready", "done"];

/**
 * S01 — the delivery flow every owner task walks, in this order (skills/README.md). An owner is a
 * task whose parent id (`S12` for `S12.3`) has no task file; a ticket inherits its owner's flow.
 */
export const FLOW_PHASES = ["brainstorm", "plan", "design", "execute", "review", "iterate"] as const;
export type FlowPhase = (typeof FLOW_PHASES)[number];
export type FlowStep = { phase: FlowPhase; done: boolean; note: string };

/** What each phase produces; `task:new` and the Claude Code prompt hook repeat it to the agent. */
export const PHASE_GUIDE: Readonly<Record<FlowPhase, string>> = {
  brainstorm: "grill-with-docs (or grill-me): settle the open decisions and record them under ## Decisions",
  plan: "to-spec then to-tickets: one ticket per smallest vertical slice with depends_on, waves from bun loom task:plan under ## Plan",
  design:
    "docs/design/<id>/: system.md, database.md and pages.md complete, plus diagram-design diagrams (flow.html, database.html, pages.html); impeccable for UI",
  execute: "implement with tdd, ticket by ticket and wave by wave: red then green evidence for every checkpoint",
  review: "code-review, then bun run lint, bun loom check and bun loom test",
  iterate: "fix the review findings and repeat execute and review until clean; note the outcome",
};

/**
 * The design pack under `docs/design/<owner>/`: each document needs every heading with content, or
 * a whole-document `n/a — <reason>`. `flow.html` is always drawn; the other diagrams follow their
 * document unless it is n/a.
 */
export const DESIGN_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  "system.md": ["Foundations", "Components", "States", "Accessibility", "Content"],
  "database.md": ["Entities", "Relationships", "Indexes and constraints", "Migrations", "Access patterns"],
  "pages.md": ["Routes", "Layout", "Data", "Interactions", "Responsive"],
};
const DESIGN_DIAGRAMS: ReadonlyArray<{ file: string; document?: string }> = [
  { file: "flow.html" },
  { file: "database.html", document: "database.md" },
  { file: "pages.html", document: "pages.md" },
];

/** File name → text (`.md`) or empty string (diagrams) for one `docs/design/<id>/` directory. */
export type DesignPack = ReadonlyMap<string, string>;

export type Task = {
  file: string;
  id: string;
  title: string;
  status: TaskStatus;
  dependsOn: string[];
  approvedBy: string;
  evidence: string;
  /** Front matter `tdd: required` opts the task into the evidence grammar. */
  tddRequired: boolean;
  body: string;
};

export type TaskFinding = { file: string; message: string };

function parseFrontMatter(body: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(body);
  if (!match?.[1]) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    out[key.trim()] = rest.join(":").trim();
  }
  return out;
}

export async function loadTasks(dir: string): Promise<Task[]> {
  const files: string[] = [];
  try {
    for await (const file of new Bun.Glob("*.md").scan({ cwd: dir })) if (file !== "README.md") files.push(file);
  } catch {
    return [];
  }
  files.sort();

  return Promise.all(
    files.map(async (file) => {
      const text = await Bun.file(join(dir, file)).text();
      const meta = parseFrontMatter(text);
      return {
        tddRequired: meta.tdd === "required",
        body: text.replace(/^---\n[\s\S]*?\n---/, ""),
        file,
        id: meta.id ?? file.replace(/\.md$/, ""),
        title: meta.title ?? "",
        status: (meta.status ?? "draft") as TaskStatus,
        dependsOn: (meta.depends_on ?? "")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        approvedBy: meta.approved_by ?? "",
        evidence: meta.evidence ?? "",
      };
    }),
  );
}

export async function loadDesignPacks(dir: string, tasks: readonly Task[]): Promise<Map<string, DesignPack>> {
  const packs = new Map<string, DesignPack>();
  for (const task of tasks) {
    const files = new Map<string, string>();
    try {
      for await (const file of new Bun.Glob("*").scan({ cwd: join(dir, task.id) })) {
        files.set(file, file.endsWith(".md") ? await Bun.file(join(dir, task.id, file)).text() : "");
      }
    } catch {
      // No design directory yet; the flow check reports it once design is ticked.
    }
    packs.set(task.id, files);
  }
  return packs;
}

export function validateTasks(
  tasks: readonly Task[],
  designPacks: ReadonlyMap<string, DesignPack> = new Map(),
): TaskFinding[] {
  const findings: TaskFinding[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const task of tasks) {
    if (!TASK_STATUSES.includes(task.status)) {
      findings.push({ file: task.file, message: `unknown status "${task.status}"` });
      continue;
    }
    if (!task.title) findings.push({ file: task.file, message: "missing title in front matter" });
    if (task.tddRequired) {
      for (const message of checkTaskEvidence(task.body)) findings.push({ file: task.file, message });
    }

    // A dependency holds the task only until it starts. `in_progress` means work has
    // begun — requiring `done` would force the agent to claim completion early. Unstarted tasks may
    // point at unstarted tasks, so planning writes the whole ticket graph up front.
    for (const dep of task.dependsOn) {
      const target = byId.get(dep);
      if (!target) findings.push({ file: task.file, message: `depends_on "${dep}" does not exist` });
      else if (STARTED.includes(task.status) && (target.status === "draft" || target.status === "blocked")) {
        findings.push({ file: task.file, message: `depends_on "${dep}" is ${target.status} — not started` });
      }
    }

    for (const message of checkFlow(task, tasks, byId, designPacks)) findings.push({ file: task.file, message });

    if (!HUMAN_APPROVAL_REQUIRED.includes(task.status)) continue;

    if (!task.approvedBy) {
      findings.push({
        file: task.file,
        message: `status "${task.status}" requires approved_by: <human name> — agent must stop at in_progress`,
      });
    }
    if (!task.evidence) {
      findings.push({
        file: task.file,
        message: `status "${task.status}" requires evidence: <command and its result>`,
      });
    }
    if (task.status === "done") {
      const unmet = task.dependsOn.filter((d) => byId.get(d)?.status !== "done");
      if (unmet.length > 0)
        findings.push({ file: task.file, message: `marked done with unmet dependencies: ${unmet.join(", ")}` });
    }
  }

  for (const cycle of dependencyCycles(tasks, byId)) {
    findings.push({ file: byId.get(cycle[0] ?? "")?.file ?? "", message: `depends_on cycle: ${cycle.join(" → ")}` });
  }

  return findings;
}

const FLOW_LINE = /^\s*[-*]\s+\[( |x)\]\s+([a-z]+):\s*(.*)$/i;
const CHECKPOINT = /^\s*[-*]\s+\[( |x)\]\s+\*\*(\S+?)[\s*]/i;

/** Lines under `## <heading>` up to the next `## `; undefined when the heading is absent. */
function section(lines: readonly string[], heading: string): string[] | undefined {
  const start = lines.findIndex(
    (line) =>
      /^##\s/.test(line) &&
      line
        .replace(/^##\s+/, "")
        .trim()
        .toLowerCase() === heading.toLowerCase(),
  );
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The six phase lines of `## Flow`, or undefined when the section is absent or not in canonical order. */
export function parseFlow(body: string): FlowStep[] | undefined {
  const lines = section(proseLines(body), "Flow");
  if (!lines) return undefined;
  const steps = lines.flatMap((line) => {
    const match = FLOW_LINE.exec(line);
    return match
      ? [
          {
            phase: (match[2] ?? "").toLowerCase(),
            done: match[1]?.toLowerCase() === "x",
            note: (match[3] ?? "").trim(),
          },
        ]
      : [];
  });
  if (steps.length !== FLOW_PHASES.length || steps.some((step, index) => step.phase !== FLOW_PHASES[index]))
    return undefined;
  return steps as FlowStep[];
}

function checkpoints(body: string): Array<{ id: string; done: boolean }> {
  return proseLines(body).flatMap((line) => {
    const match = CHECKPOINT.exec(line);
    return match ? [{ id: match[2] ?? "", done: match[1]?.toLowerCase() === "x" }] : [];
  });
}

function parentId(id: string): string | undefined {
  const dot = id.lastIndexOf(".");
  return dot > 0 ? id.slice(0, dot) : undefined;
}

/** The top-most ancestor with a task file; an owner is its own owner. */
export function ownerOf(task: Task, byId: ReadonlyMap<string, Task>): Task {
  let owner = task;
  for (let parent = parentId(owner.id); parent && byId.has(parent); parent = parentId(parent)) {
    owner = byId.get(parent) ?? owner;
  }
  return owner;
}

function phaseDone(task: Task, phase: FlowPhase): boolean {
  return parseFlow(task.body)?.find((step) => step.phase === phase)?.done ?? false;
}

export function checkDesignPack(id: string, pack: DesignPack): string[] {
  const findings: string[] = [];
  const notApplicable = new Set<string>();
  for (const [file, headings] of Object.entries(DESIGN_DOCUMENTS)) {
    const text = pack.get(file);
    const path = `docs/design/${id}/${file}`;
    if (text === undefined) {
      findings.push(`design: ${path} is missing`);
      continue;
    }
    const lines = text.replace(/<!--[\s\S]*?-->/g, "").split("\n");
    const lead = lines
      .filter((line) => !/^#\s/.test(line))
      .join("\n")
      .trim();
    if (/^n\/a\s*[—-]\s*\S/i.test(lead)) {
      notApplicable.add(file);
      continue;
    }
    for (const heading of headings) {
      if (!section(lines, heading)?.join("").trim()) {
        findings.push(`design: ${path} needs "## ${heading}" with content, or "n/a — <reason>" for the whole document`);
      }
    }
  }
  for (const { file, document } of DESIGN_DIAGRAMS) {
    if (document && (notApplicable.has(document) || !pack.has(document))) continue;
    if (!pack.has(file))
      findings.push(`design: docs/design/${id}/${file} is missing — draw it with the diagram-design skill`);
  }
  return findings;
}

/**
 * S01 flow rules. Owners: six phases in order, a note per ticked phase, and the artifact each ticked
 * phase promises. Tickets and checkpoints: nothing starts before the owner ticks design.
 */
function checkFlow(
  task: Task,
  tasks: readonly Task[],
  byId: ReadonlyMap<string, Task>,
  designPacks: ReadonlyMap<string, DesignPack>,
): string[] {
  const findings: string[] = [];
  const owner = ownerOf(task, byId);
  const ticked = checkpoints(task.body).some((checkpoint) => checkpoint.done);

  if (owner !== task) {
    if (!phaseDone(owner, "design")) {
      if (STARTED.includes(task.status)) {
        findings.push(
          `cannot be ${task.status} before ${owner.id} ticks design — finish brainstorm, plan and design there first`,
        );
      }
      if (ticked) findings.push(`checkpoints are ticked before ${owner.id} ticks design`);
    }
    return findings;
  }

  const steps = parseFlow(task.body);
  if (!steps) {
    findings.push(
      `flow: add a "## Flow" section with one "- [ ] <phase>:" line per phase, in order: ${FLOW_PHASES.join(", ")}`,
    );
    if (ticked) findings.push(`checkpoints are ticked before ${task.id} ticks design`);
    return findings;
  }

  steps.forEach((step, index) => {
    if (!step.done) return;
    if (!step.note) findings.push(`flow: ${step.phase} is ticked without a note — say what the phase produced`);
    const open = steps.slice(0, index).find((earlier) => !earlier.done);
    if (open) findings.push(`flow: ${step.phase} is ticked before ${open.phase}`);
  });
  const done = (phase: FlowPhase) => steps.find((step) => step.phase === phase)?.done ?? false;
  const children = tasks.filter((other) => other !== task && ownerOf(other, byId) === task);

  if (done("plan")) {
    // The waves usually arrive as a fenced `task:plan` paste, so fenced lines count; scaffold comments do not.
    if (
      !section(task.body.replace(/<!--[\s\S]*?-->/g, "").split("\n"), "Plan")
        ?.join("")
        .trim()
    ) {
      findings.push(`flow: plan is ticked without a "## Plan" section — paste bun loom task:plan ${task.id}`);
    }
    if (children.length === 0 && checkpoints(task.body).length === 0) {
      findings.push("flow: plan is ticked but there are no tickets or checkpoints");
    }
    for (const child of children) {
      if (checkpoints(child.body).length === 0) {
        findings.push(
          `flow: plan is ticked but ${child.id} has no checkpoint — split it into the smallest verifiable steps`,
        );
      }
    }
  }
  if (done("design")) findings.push(...checkDesignPack(task.id, designPacks.get(task.id) ?? new Map()));
  else if (ticked) findings.push(`checkpoints are ticked before ${task.id} ticks design`);
  if (done("execute")) {
    for (const member of [task, ...children]) {
      if (member !== task && !STARTED.includes(member.status)) {
        findings.push(`flow: execute is ticked but ${member.id} is ${member.status}`);
      }
      if (checkpoints(member.body).some((checkpoint) => !checkpoint.done)) {
        findings.push(`flow: execute is ticked but ${member.id} has unticked checkpoints`);
      }
    }
  }
  if (HUMAN_APPROVAL_REQUIRED.includes(task.status) && steps.some((step) => !step.done)) {
    findings.push(`status "${task.status}" requires every flow phase ticked`);
  }
  return findings;
}

/**
 * The owner's tickets in waves: a ticket joins the first wave after all of its in-plan dependencies,
 * so every ticket in one wave can run in parallel. Dependencies outside the plan count as met.
 */
export function planWaves(owner: Task, tasks: readonly Task[]): Task[][] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const tickets = tasks
    .filter((task) => task !== owner && ownerOf(task, byId) === owner)
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  const inPlan = new Set(tickets.map((ticket) => ticket.id));
  const placed = new Set<string>();
  const waves: Task[][] = [];
  while (placed.size < tickets.length) {
    const wave = tickets.filter(
      (ticket) => !placed.has(ticket.id) && ticket.dependsOn.every((dep) => !inPlan.has(dep) || placed.has(dep)),
    );
    if (wave.length === 0) {
      const stuck = tickets.filter((ticket) => !placed.has(ticket.id)).map((ticket) => ticket.id);
      throw new Error(`depends_on cycle among ${stuck.join(", ")}`);
    }
    for (const ticket of wave) placed.add(ticket.id);
    waves.push(wave);
  }
  return waves;
}

/** `bun loom task:plan` output, ready to paste into the owner's `## Plan` inside a text fence. */
export function formatPlan(owner: Task, tasks: readonly Task[]): string {
  const waves = planWaves(owner, tasks);
  const lines = [`${owner.id} — ${owner.title}`];
  if (waves.length === 0) lines.push("No tickets yet; the owner's checkpoints run in order.");
  waves.forEach((wave, index) => {
    const label = wave.length > 1 ? `Wave ${index + 1} (parallel)` : `Wave ${index + 1}`;
    lines.push(`${label}: ${wave.map((ticket) => `${ticket.id} ${ticket.title}`).join(" · ")}`);
  });
  return `${lines.join("\n")}\n`;
}

/** Every `depends_on` cycle once, as the id path that closes it. */
function dependencyCycles(tasks: readonly Task[], byId: ReadonlyMap<string, Task>): string[][] {
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (id: string) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      const seen = state.get(dep);
      if (seen === "visiting") cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
      else if (!seen) visit(dep);
    }
    stack.pop();
    state.set(id, "visited");
  };
  for (const task of tasks) if (!state.has(task.id)) visit(task.id);
  return cycles;
}

/**
 * Evidence grammar for tasks with `tdd: required` (documented in docs/gates.md).
 *
 * - Ticked item:  `- [x] **<ID> title**` (outside code fences).
 * - Under `## Evidence`, one line per phase and ID:
 *     `- red: <ID> \`<command>\` — <output excerpt>`
 *     `- green: <ID> \`<command>\` — <output excerpt>`
 *     `- red: <ID> n/a — <reason>`   (docs-only items; green is still required)
 * - `red:` for an ID must appear before its `green:`; NOT_RUN or BLOCKED items are not ticked.
 */
const TICKED_ITEM = /^\s*[-*]\s+\[x\]\s+\*\*(\S+?)[\s*]/i;
const EVIDENCE_LINE = /^\s*[-*]\s+(red|green):\s+(\S+)\s*(.*)$/i;
const COMMAND_AND_OUTPUT = /^`[^`]+`\s*(?:[—:-]\s*)?\S/;
const RED_NOT_APPLICABLE = /^n\/a\s*[—-]\s*(.*)$/i;
const UNVERIFIED_MARKER = /\b(NOT_RUN|BLOCKED)\b/;

function proseLines(body: string): string[] {
  const lines: string[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced) lines.push(line);
  }
  return lines;
}

export function checkTaskEvidence(body: string): string[] {
  const findings: string[] = [];
  const lines = proseLines(body);
  const evidenceStart = lines.findIndex((line) => /^##\s+Evidence\b/i.test(line));
  const ticked = new Map<string, string>();
  for (const line of lines) {
    const id = TICKED_ITEM.exec(line)?.[1];
    if (id) ticked.set(id, line);
  }
  const tail = evidenceStart < 0 ? [] : lines.slice(evidenceStart + 1);
  const end = tail.findIndex((line) => /^##\s/.test(line));
  const evidence = end < 0 ? tail : tail.slice(0, end);

  const redSeen = new Set<string>();
  const greenSeen = new Set<string>();
  for (const line of evidence) {
    const match = EVIDENCE_LINE.exec(line);
    if (!match) continue;
    const kind = (match[1] ?? "").toLowerCase();
    const id = match[2] ?? "";
    const rest = (match[3] ?? "").trim();
    if (UNVERIFIED_MARKER.test(rest) && ticked.has(id)) {
      findings.push(`${id}: ${kind} is ${rest.match(UNVERIFIED_MARKER)?.[1]} but the item is ticked`);
      continue;
    }
    const notApplicable = RED_NOT_APPLICABLE.exec(rest);
    if (kind === "red" && notApplicable) {
      if (!notApplicable[1]?.trim()) findings.push(`${id}: "red: n/a" needs a non-empty reason after the dash`);
      else redSeen.add(id);
      continue;
    }
    if (!COMMAND_AND_OUTPUT.test(rest)) {
      findings.push(`${id}: ${kind} line needs a backticked command followed by an output excerpt`);
      continue;
    }
    if (kind === "red") redSeen.add(id);
    else if (!redSeen.has(id)) findings.push(`${id}: green before red — record the failing run first`);
    else greenSeen.add(id);
  }

  for (const [id, line] of ticked) {
    const marker = UNVERIFIED_MARKER.exec(line)?.[1];
    if (marker) findings.push(`${id}: item is ticked but marked ${marker}`);
    if (!redSeen.has(id) && !findings.some((f) => f.startsWith(`${id}:`)))
      findings.push(`${id}: ticked without a "red:" evidence line`);
    if (!greenSeen.has(id) && !findings.some((f) => f.startsWith(`${id}: green`))) {
      findings.push(`${id}: ticked without a "green:" evidence line`);
    }
  }
  return findings;
}
