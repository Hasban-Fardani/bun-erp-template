import { resolve } from "node:path";
import { repoRoot } from "./lib/repo.ts";

/**
 * Command registry. A module declares its commands with `defineCommand("<name>", handler)`;
 * discovery reads those name literals straight from the file, so the registry can map a command
 * to its module without importing it. Only the module that owns the running command is imported,
 * which keeps `bun loom --help` and single commands off the server runtime.
 *
 * The discovery result is cached in `cli/.command-index.json`, keyed by file mtime: `--help` and
 * `runCommand` only re-read a command file when its mtime changed, so a normal run does one async
 * scan plus one JSON read instead of regex-reading every command module. The file is generated
 * (gitignored) and rebuilt automatically; a corrupt cache is treated as absent.
 */
export type CommandHandler = (args: string[]) => Promise<void>;
export type CommandDefinition = { name: string; run: CommandHandler };

export function defineCommand(name: string, run: CommandHandler): CommandDefinition {
  return { name, run };
}

const DISCOVERY_GLOBS = ["cli/commands/**/*.ts", "apps/*/cli/commands/**/*.ts", "packages/*/cli/commands/**/*.ts"];
const DEFINE_COMMAND = /defineCommand\(\s*["']([^"']+)["']/g;
const INDEX_FILE = resolve(repoRoot, "cli/.command-index.json");
const INDEX_VERSION = 1;

type CommandFileEntry = { mtimeMs: number; commands: string[] };
type CommandIndexFile = { version: number; files: Record<string, CommandFileEntry> };

let index: Map<string, string> | undefined;

/** The discovered files in glob order, sorted inside each glob so the first-wins rule is stable. */
async function discoverCommandFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const glob of DISCOVERY_GLOBS) {
    const found: string[] = [];
    for await (const file of new Bun.Glob(glob).scan({ cwd: repoRoot, onlyFiles: true })) found.push(file);
    files.push(...found.sort());
  }
  return files;
}

async function readCachedIndex(): Promise<CommandIndexFile | undefined> {
  try {
    const parsed = (await Bun.file(INDEX_FILE).json()) as CommandIndexFile;
    return parsed.version === INDEX_VERSION && typeof parsed.files === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function commandIndex(): Promise<Map<string, string>> {
  if (index) return index;
  const cached = await readCachedIndex();
  const files = await discoverCommandFiles();
  const next: CommandIndexFile = { version: INDEX_VERSION, files: {} };
  let changed = cached === undefined || Object.keys(cached.files).some((file) => !files.includes(file));

  for (const file of files) {
    const mtimeMs = Bun.file(resolve(repoRoot, file)).lastModified;
    const entry = cached?.files[file];
    if (entry && entry.mtimeMs === mtimeMs) {
      next.files[file] = entry;
      continue;
    }
    changed = true;
    const text = await Bun.file(resolve(repoRoot, file)).text();
    const commands: string[] = [];
    for (const match of text.matchAll(DEFINE_COMMAND)) {
      if (match[1]) commands.push(match[1]);
    }
    next.files[file] = { mtimeMs, commands };
  }

  const map = new Map<string, string>();
  for (const file of files) {
    for (const name of next.files[file]?.commands ?? []) {
      if (!map.has(name)) map.set(name, file);
    }
  }
  if (changed) {
    // A lost race writes either the same or a newer index; a truncated file fails the JSON parse
    // on the next run and is rebuilt, so no lock is needed. A read-only checkout still works: the
    // index is only a cache, so a failed write must never fail the command.
    try {
      await Bun.write(INDEX_FILE, `${JSON.stringify(next, null, 2)}\n`);
    } catch {
      // Ignore: discovery already happened in memory.
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
