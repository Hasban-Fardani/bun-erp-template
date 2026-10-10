import { resolve } from "node:path";
import { DESIGN_DOCUMENTS, formatPlan, loadTasks, ownerOf } from "../gates/tasks.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { repoRoot, TASKS_DIR } from "../lib/repo.ts";
import { formatScaffold, writeScaffold } from "../lib/scaffold.ts";
import { toKebabName } from "../lib/scaffolding.ts";
import { renderDesignDocument, renderOwnerTask, renderTicket } from "../lib/task-templates.ts";
import { defineCommand } from "../registry.ts";

const DESIGN_DIR = resolve(repoRoot, "docs/design");

export const commands = [
  defineCommand("task:new", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["depends-on"] });
    const id = resolveRequired(parsed.positional[0], "Task id");
    const title = resolveRequired(parsed.positional[1], "Task title");
    if (!id || !title) {
      process.stderr.write("Usage: bun loom task:new <id> <title> [--depends-on <id,id>]\n");
      process.exit(1);
    }
    const dependsOn = (parsed.values.get("depends-on") ?? "")
      .split(",")
      .map((dep) => dep.trim())
      .filter(Boolean);
    const slug = toKebabName(title, "Task").slice(0, 48);
    const file = `${id}-${slug}.md`;
    const path = resolve(TASKS_DIR, file);
    if (await Bun.file(path).exists()) throw new Error(`Task already exists: docs/tasks/${file}`);

    // A ticket's parent already has a task file; anything else owns its flow and design pack.
    const tasks = await loadTasks(TASKS_DIR);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const parent = id.includes(".") ? byId.get(id.slice(0, id.lastIndexOf("."))) : undefined;
    const written = [path];
    if (parent) {
      await writeScaffold(path, renderTicket(id, title, dependsOn));
      process.stdout.write(`Created docs/tasks/${file} (ticket of ${ownerOf(parent, byId).id}, draft)\n`);
    } else {
      await writeScaffold(path, renderOwnerTask(id, title, dependsOn));
      process.stdout.write(`Created docs/tasks/${file} (owner: six-phase flow)\n`);
      for (const document of Object.keys(DESIGN_DOCUMENTS)) {
        const designPath = resolve(DESIGN_DIR, id, document);
        if (await Bun.file(designPath).exists()) continue;
        await writeScaffold(designPath, renderDesignDocument(id, document));
        written.push(designPath);
        process.stdout.write(`Created docs/design/${id}/${document}\n`);
      }
      process.stdout.write(`Draw docs/design/${id}/flow.html (and database.html, pages.html) with diagram-design.\n`);
    }
    await formatScaffold(written);
  }),

  defineCommand("task:plan", async (args) => {
    const tasks = await loadTasks(TASKS_DIR);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const requested = args[0];
    const owners = requested
      ? [byId.get(requested)]
      : tasks.filter(
          (task) =>
            ownerOf(task, byId) === task && tasks.some((other) => other !== task && ownerOf(other, byId) === task),
        );
    if (requested && !owners[0]) throw new Error(`No task ${requested} in docs/tasks`);
    for (const owner of owners) {
      if (owner) process.stdout.write(`${formatPlan(ownerOf(owner, byId), tasks)}\n`);
    }
  }),
];
