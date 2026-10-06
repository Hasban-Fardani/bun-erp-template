/**
 * CLI entry point (PRD §11). Parses argv, prints help, and dispatches through the command
 * registry. Command modules are imported lazily, so `--help` never touches the server runtime.
 * App-owned commands (db, user, role, jobs, ...) appear once their app is installed.
 */
import { HELP_GROUPS } from "./lib/help.ts";
import { commandNames, runCommand } from "./registry.ts";

const [command, ...args] = process.argv.slice(2);

async function printHelp(): Promise<void> {
  const available = new Set(await commandNames());
  const sections = HELP_GROUPS.map(({ title, commands }) => {
    const entries = commands.filter(([name]) => available.has(name.split(" ")[0] ?? ""));
    if (entries.length === 0) return "";
    const width = Math.max(...entries.map(([name]) => name.length));
    const lines = entries.map(([name, description]) => `  ${name.padEnd(width)}  ${description}`).join("\n");
    return `${title}\n${lines}`;
  }).filter(Boolean);
  process.stdout.write(`bun erp <command> [args]\n\n${sections.join("\n\n")}\n`);
  if (!available.has("db:migrate")) {
    process.stdout.write(
      "\nThe server app is not installed, so its commands are hidden. Run `bun erp init` to choose an app combination.\n",
    );
  }
}

if (!command || command === "--help" || command === "-h" || command === "help") {
  await printHelp();
  process.exit(0);
}

try {
  const handled = await runCommand(command, args);
  if (!handled) {
    process.stderr.write(`Unknown command: ${command}. Run: bun erp --help\n`);
    process.exit(1);
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
