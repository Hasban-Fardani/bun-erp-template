export type CommandOptions = {
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
};

/**
 * Minimal artisan-style parser: `--flag`, `--key value`, and `--key=value`.
 * Unknown options fail loudly, so a typo never silently drops operator input.
 */
export function parseCommandOptions(
  args: readonly string[],
  spec: { flags?: readonly string[]; values?: readonly string[] },
): CommandOptions {
  const knownFlags = new Set(spec.flags ?? []);
  const knownValues = new Set(spec.values ?? []);
  const parsed: CommandOptions = { positional: [], flags: new Set(), values: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (key && knownFlags.has(key)) {
      if (inlineValue !== undefined) throw new Error(`--${key} does not take a value`);
      parsed.flags.add(key);
      continue;
    }
    if (key && knownValues.has(key)) {
      const value = inlineValue ?? args[index + 1];
      if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
        throw new Error(`--${key} requires a value`);
      }
      parsed.values.set(key, value);
      if (inlineValue === undefined) index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}
