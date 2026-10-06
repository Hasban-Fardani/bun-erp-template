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
  let files: string[] = [];
  try {
    files = [...new Bun.Glob("*.md").scanSync({ cwd: dir })].sort();
  } catch {
    return [];
  }

  return Promise.all(
    files.map(async (file) => {
      const meta = parseFrontMatter(await Bun.file(join(dir, file)).text());
      return {
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
