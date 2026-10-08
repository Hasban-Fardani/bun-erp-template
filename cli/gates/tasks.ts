import { join } from "node:path";

/** F1.11 — ready/done require approved_by + evidence; an agent cannot raise them silently. */
export const TASK_STATUSES = ["draft", "blocked", "ready", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses that require recorded human approval. */
const HUMAN_APPROVAL_REQUIRED: readonly TaskStatus[] = ["ready", "done"];

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

export function validateTasks(tasks: readonly Task[]): TaskFinding[] {
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
    // begun — requiring `done` would force the agent to claim completion early.
    for (const dep of task.dependsOn) {
      const target = byId.get(dep);
      if (!target) findings.push({ file: task.file, message: `depends_on "${dep}" does not exist` });
      else if (target.status === "draft" || target.status === "blocked") {
        findings.push({ file: task.file, message: `depends_on "${dep}" is ${target.status} — not started` });
      }
    }

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

  return findings;
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
