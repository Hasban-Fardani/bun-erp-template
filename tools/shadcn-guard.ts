import { join } from "node:path";

/**
 * shadcn-first gate.
 *
 * The repo is shadcn-first: when a component exists upstream, it is used. The previous approach
 * was "native first, build it ourselves if native is not enough", which produced a native
 * `<select>` that could not be themed, a hand-rolled popover, and a role picker that was a scroll
 * hunt. A design system exists precisely so those decisions are not made per screen.
 *
 * Two rules:
 *  A. No native interactive element that shadcn already ships.
 *  B. A select with more than `MAX_SELECT_OPTIONS` options must be a Combobox — past a handful
 *     of entries the user needs to type, not read.
 */

/** Above this many options, a list must be searchable. */
const MAX_SELECT_OPTIONS = 3;

/** Native elements replaced by a shadcn component. Adding an entry means adding the component. */
const BANNED_NATIVE: readonly { pattern: RegExp; shadcn: string }[] = [
  { pattern: /<select[\s>]/, shadcn: "Select (shared/ui/select.tsx)" },
  { pattern: /<input[^>]*type="checkbox"/, shadcn: "Checkbox" },
  { pattern: /<input[^>]*type="radio"/, shadcn: "RadioGroup" },
];

export type ShadcnFinding = { file: string; line: number; rule: string; detail: string };

export async function checkShadcn(root: string): Promise<ShadcnFinding[]> {
  const findings: ShadcnFinding[] = [];
  const webSrc = join(root, "apps/web/src");

  for await (const path of new Bun.Glob("**/*.tsx").scan({ cwd: webSrc })) {
    // The primitives themselves may wrap anything; they are the boundary.
    if (path.startsWith("shared/ui/")) continue;

    const file = join(webSrc, path);
    const code = await Bun.file(file).text();
    const lines = code.split("\n");

    lines.forEach((line, index) => {
      for (const { pattern, shadcn } of BANNED_NATIVE) {
        if (pattern.test(line)) {
          findings.push({
            file: path,
            line: index + 1,
            rule: "NATIVE_COMPONENT",
            detail: `native element where shadcn already ships one — use ${shadcn}`,
          });
        }
      }
    });

    findings.push(...oversizedLists(path, code));
  }

  return findings;
}

/**
 * Counts options of a select whose list is written literally. Dynamic lists cannot be judged
 * statically; the rule then rests on review, and the component name says which one was chosen.
 */
function oversizedLists(file: string, code: string): ShadcnFinding[] {
  const findings: ShadcnFinding[] = [];

  const countIn = (text: string) => (text.match(/\{\s*value:/g) ?? []).length;

  // `SimpleSelect ... options={[ ... ]}`
  for (const match of code.matchAll(/SimpleSelect[\s\S]{0,400}?options=\{\[([\s\S]*?)\]\}/g)) {
    const body = match[1] ?? "";
    const count = countIn(body);
    if (count > MAX_SELECT_OPTIONS) {
      findings.push({
        file,
        line: lineOf(code, match.index ?? 0),
        rule: "SELECT_TOO_MANY_OPTIONS",
        detail: `${count} options exceeds ${MAX_SELECT_OPTIONS} — use Combobox (shared/ui/combobox.tsx)`,
      });
    }
  }

  // `<Select> ... <SelectItem/> ... </Select>`
  for (const match of code.matchAll(/<Select[\s>][\s\S]*?<\/Select>/g)) {
    const body = match[0];
    const count = (body.match(/<SelectItem/g) ?? []).length;
    if (count > MAX_SELECT_OPTIONS) {
      findings.push({
        file,
        line: lineOf(code, match.index ?? 0),
        rule: "SELECT_TOO_MANY_OPTIONS",
        detail: `${count} options exceeds ${MAX_SELECT_OPTIONS} — use Combobox (shared/ui/combobox.tsx)`,
      });
    }
  }

  return findings;
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}
