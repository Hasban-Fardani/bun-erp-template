/**
 * Interactive fallback for required arguments. Prompts only on a TTY: in CI (no TTY) it returns
 * undefined so the command falls back to its usage error and never blocks a pipeline.
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

export function promptFor(label: string): string | undefined {
  if (!isInteractive()) return undefined;
  const answer = prompt(`${label}: `);
  const value = answer?.trim();
  return value ? value : undefined;
}

/** Use the provided value, otherwise ask on a TTY; undefined when neither is available. */
export function resolveRequired(provided: string | undefined, label: string): string | undefined {
  if (provided && provided.length > 0) return provided;
  return promptFor(label);
}

export type ChoiceOption<T> = { label: string; value: T };

/**
 * Artisan-style choice list: numbered options, never free text. An empty answer takes the
 * fallback, an invalid number re-asks, and a non-TTY call falls back without blocking a pipeline.
 */
export function promptChoice<T>(label: string, options: readonly ChoiceOption<T>[], fallback: T): T {
  if (!isInteractive()) return fallback;
  process.stdout.write(`${label}\n`);
  for (const [index, option] of options.entries()) {
    process.stdout.write(`  ${index + 1}) ${option.label}\n`);
  }
  for (;;) {
    const answer = prompt(`Choice [1-${options.length}]: `)?.trim();
    if (!answer) return fallback;
    const index = Number(answer);
    const chosen = Number.isInteger(index) ? options[index - 1] : undefined;
    if (chosen) return chosen.value;
    process.stdout.write(`Enter a number from 1 to ${options.length}.\n`);
  }
}
