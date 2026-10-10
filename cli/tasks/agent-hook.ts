import { resolve } from "node:path";
import { missingAgentSkills } from "../gates/agent-skills.ts";
import { FLOW_PHASES, loadTasks, ownerOf, PHASE_GUIDE, parseFlow, type Task } from "../gates/tasks.ts";

/**
 * Claude Code hooks, wired in `.claude/settings.json`. `session` (SessionStart) restores missing
 * project skills and states the flow; `prompt` (UserPromptSubmit) names each active owner's next
 * phase. A hook must never break a session: failures become context text and the process exits 0.
 */

const root = resolve(import.meta.dir, "../..");

type SessionStartOutput = {
  hookSpecificOutput: { hookEventName: "SessionStart"; additionalContext: string; reloadSkills?: true };
};

export function flowReminder(tasks: readonly Task[]): string {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const active = tasks.filter((task) => task.status === "in_progress" && ownerOf(task, byId) === task);
  const lines = [
    `Loom delivery flow, enforced by bun loom check:task: ${FLOW_PHASES.join(" → ")}. A skipped or reordered phase fails the gate; skills/README.md maps each phase to its skills.`,
  ];
  if (active.length === 0) {
    lines.push(
      '- No owner task is in progress. Nontrivial work starts with brainstorm, then bun loom task:new <id> "<title>" (docs/agents/issue-tracker.md).',
    );
  }
  for (const owner of active) {
    const steps = parseFlow(owner.body);
    const next = steps?.find((step) => !step.done);
    if (!steps) lines.push(`- ${owner.id} ${owner.title}: add the "## Flow" section first (bun loom check:task).`);
    else if (!next) lines.push(`- ${owner.id} ${owner.title}: every phase ticked — waiting for human review.`);
    else lines.push(`- ${owner.id} ${owner.title}: next phase ${next.phase} — ${PHASE_GUIDE[next.phase]}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function promptHookOutput(projectRoot: string): Promise<string> {
  return flowReminder(await loadTasks(resolve(projectRoot, "docs/tasks")));
}

export async function sessionHookOutput(
  projectRoot: string,
  install: () => Promise<void>,
): Promise<SessionStartOutput> {
  const before = await missingAgentSkills(projectRoot);
  let skills = "Agent skills: every required skill is present in .agents/skills and .claude/skills.";
  let restored = false;
  if (before.length > 0) {
    try {
      await install();
    } catch {
      // Reported through the re-check below; the session must start either way.
    }
    const after = await missingAgentSkills(projectRoot);
    restored = after.length < before.length;
    skills =
      after.length === 0
        ? `Agent skills: restored ${before.length} missing copies with bun loom ai:skills; Claude Code reloads them now.`
        : `Agent skills still missing: ${after.join(", ")} — run bun loom ai:skills (needs network).`;
  }
  const additionalContext = `${flowReminder(await loadTasks(resolve(projectRoot, "docs/tasks")))}${skills}\n`;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
      ...(restored ? { reloadSkills: true } : {}),
    },
  };
}

/** The installer prints progress; run it in a child so only the hook JSON reaches stdout. */
async function installInChild(): Promise<void> {
  const child = Bun.spawn(["bun", "cli/index.ts", "ai:skills"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if ((await child.exited) !== 0) throw new Error(await new Response(child.stderr).text());
}

if (import.meta.main) {
  const mode = process.argv[2];
  try {
    if (mode === "session") process.stdout.write(JSON.stringify(await sessionHookOutput(root, installInChild)));
    else if (mode === "prompt") process.stdout.write(await promptHookOutput(root));
    else process.stderr.write("Usage: bun cli/tasks/agent-hook.ts <session|prompt>\n");
  } catch (error) {
    process.stdout.write(`Loom hook skipped: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
