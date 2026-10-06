import { resolve } from "node:path";
import { repoRoot } from "./lib/repo.ts";

/**
 * Command registry. A module declares its commands with `defineCommand("<name>", handler)`;
 * discovery reads those name literals straight from the file, so the registry can map a command
 * to its module without importing it. Only the module that owns the running command is imported,
 * which keeps `bun erp --help` and single commands off the server runtime.
 */
export type CommandHandler = (args: string[]) => Promise<void>;
export type CommandDefinition = { name: string; run: CommandHandler };

export function defineCommand(name: string, run: CommandHandler): CommandDefinition {
  return { name, run };
}

const DISCOVERY_GLOBS = ["cli/commands/**/*.ts", "apps/*/cli/commands/**/*.ts", "packages/*/cli/commands/**/*.ts"];
const DEFINE_COMMAND = /defineCommand\(\s*["']([^"']+)["']/g;

let index: Map<string, string> | undefined;

async function commandIndex(): Promise<Map<string, string>> {
  if (index) return index;
  const map = new Map<string, string>();
  for (const glob of DISCOVERY_GLOBS) {
    for (const file of new Bun.Glob(glob).scanSync({ cwd: repoRoot })) {
      const text = await Bun.file(resolve(repoRoot, file)).text();
      for (const match of text.matchAll(DEFINE_COMMAND)) {
        const name = match[1];
        if (name && !map.has(name)) map.set(name, file);
      }
    }
  }
  index = map;
  return map;
}

/** Every declared command name, sorted. Used by tests and tooling; dispatch does not need it. */
export async function commandNames(): Promise<string[]> {
  return [...(await commandIndex()).keys()].sort();
}

/** Import only the module that declares `name` and run its handler. Returns false when unknown. */
export async function runCommand(name: string, args: string[]): Promise<boolean> {
  const file = (await commandIndex()).get(name);
  if (!file) return false;
  const module = (await import(resolve(repoRoot, file))) as { commands?: CommandDefinition[] };
  const definition = module.commands?.find((command) => command.name === name);
  if (!definition) throw new Error(`Command "${name}" is declared in ${file} but not exported`);
  await definition.run(args);
  return true;
}
