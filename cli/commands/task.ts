import { resolve } from "node:path";
import { resolveRequired } from "../lib/prompt.ts";
import { TASKS_DIR } from "../lib/repo.ts";
import { formatScaffold, writeScaffold } from "../lib/scaffold.ts";
import { toKebabName } from "../lib/scaffolding.ts";
import { defineCommand } from "../registry.ts";

/** A task file is a checkpoint plus its evidence; the TDD checkpoints mirror AGENTS.md. */
function renderTask(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
status: in_progress
evidence: pending — append the commands run and their results
---

> Living task. Human-owned status: an agent leaves this at \`in_progress\` with real evidence and
> never raises it to \`ready\` or \`done\` itself.

# ${id} — ${title}

## Goal

## Checkpoints

- [ ] Failing test written first (red) and its output recorded
- [ ] Implementation makes the same test pass (green)
- [ ] \`bun erp check\` green
- [ ] Evidence recorded below

## Evidence

_(append command + result)_
`;
}

export const commands = [
  defineCommand("task:new", async (args) => {
    const id = resolveRequired(args[0], "Task id");
    const title = resolveRequired(args[1], "Task title");
    if (!id || !title) {
      process.stderr.write("Usage: bun erp task:new <id> <title>\n");
      process.exit(1);
    }
    const slug = toKebabName(title, "Task").slice(0, 48);
    const file = `${id}-${slug}.md`;
    const path = resolve(TASKS_DIR, file);
    if (await Bun.file(path).exists()) throw new Error(`Task already exists: docs/tasks/${file}`);
    await writeScaffold(path, renderTask(id, title));
    await formatScaffold([path]);
    process.stdout.write(`Created docs/tasks/${file}\n`);
  }),
];
