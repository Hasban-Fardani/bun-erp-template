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
tdd: required
evidence: pending — append the commands run and their results
---

> Living task. Human-owned status: an agent leaves this at \`in_progress\` with real evidence and
> never raises it to \`ready\` or \`done\` itself.

# ${id} — ${title}

## Goal

## Checkpoints

- [ ] **${id}.1** Replace this with one verifiable item; tick it only after its red and green lines exist
- [ ] **${id}.2** \`bun erp check\` green

## Evidence

\`tdd: required\` makes \`bun erp check\` enforce this grammar for every ticked \`**<ID>**\` item:

\`\`\`text
- red: ${id}.1 \`bun erp test --filter thing\` — 1 fail: expected 2, received 1
- green: ${id}.1 \`bun erp test --filter thing\` — 1 pass
- red: ${id}.3 n/a — docs-only, nothing executable to fail
- green: ${id}.3 \`bun erp check\` — 0 findings
\`\`\`

Red comes before green for the same ID. \`NOT_RUN\` and \`BLOCKED\` items stay unticked.
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
