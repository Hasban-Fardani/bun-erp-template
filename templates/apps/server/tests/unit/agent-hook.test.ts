import { expect, test } from "bun:test";
import { AGENT_SKILL_DIRS, REQUIRED_AGENT_SKILLS } from "@cli/gates/agent-skills.ts";
import { FLOW_PHASES, loadTasks, PHASE_GUIDE } from "@cli/gates/tasks.ts";
import { renderOwnerTask } from "@cli/lib/task-templates.ts";
import { flowReminder, promptHookOutput, sessionHookOutput } from "@cli/tasks/agent-hook.ts";
import { withTempRoot } from "./support/temp-root.ts";

const installEverything = (root: string) => async () => {
  for (const dir of AGENT_SKILL_DIRS) {
    for (const skill of REQUIRED_AGENT_SKILLS) await Bun.write(`${root}/${dir}/${skill}/SKILL.md`, `name: ${skill}`);
  }
};

test("the reminder names each active owner's next phase and what it requires", async () => {
  const brainstormed = renderOwnerTask("S1", "Invoices").replace("- [ ] brainstorm:", "- [x] brainstorm: decided");
  await withTempRoot({ "docs/tasks/S1-invoices.md": brainstormed }, async (root) => {
    const reminder = flowReminder(await loadTasks(`${root}/docs/tasks`));
    expect(reminder).toContain(FLOW_PHASES.join(" → "));
    expect(reminder).toContain(`S1 Invoices: next phase plan — ${PHASE_GUIDE.plan}`);
  });
  expect(flowReminder([])).toContain("No owner task is in progress");
});

test("the prompt hook prints the reminder for the repository's tasks", async () => {
  await withTempRoot({ "docs/tasks/S2-pay.md": renderOwnerTask("S2", "Payments") }, async (root) => {
    expect(await promptHookOutput(root)).toContain("S2 Payments: next phase brainstorm");
  });
});

test("the session hook restores missing skills and asks Claude Code to reload them", async () => {
  await withTempRoot({}, async (root) => {
    const output = await sessionHookOutput(root, installEverything(root));
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.reloadSkills).toBe(true);
    expect(output.hookSpecificOutput.additionalContext).toContain("restored");

    let called = false;
    const again = await sessionHookOutput(root, async () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(again.hookSpecificOutput.reloadSkills).toBeUndefined();
  });
});

test("a failed restore never breaks the session and says how to recover", async () => {
  await withTempRoot({}, async (root) => {
    const output = await sessionHookOutput(root, async () => {
      throw new Error("offline");
    });
    expect(output.hookSpecificOutput.reloadSkills).toBeUndefined();
    expect(output.hookSpecificOutput.additionalContext).toContain("run bun loom ai:skills");
    expect(output.hookSpecificOutput.additionalContext).toContain(".claude/skills/diagram-design");
  });
});
