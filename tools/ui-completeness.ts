import { join } from "node:path";

/**
 * UI-completeness gate, from the antislop rules (R-27, R-32, R-34, R-35) bundled as skills.
 *
 * Every rule here exists because it was violated in this repo first, so the checks are
 * mechanical on purpose: R-27 (a view that shows data needs empty/loading/error), R-32
 * (keyboard focus must stay visible), R-34 (a theme you ship must actually work), R-35
 * (verify by running, not by claiming).
 */
export type UiFinding = { file: string; rule: string; detail: string };

/**
 * Only page-level screens are checked for list states: a page is where the user arrives, so a
 * missing branch is visible to them. The shared table component owns the states themselves.
 */
const SCREEN_DIRS = ["apps/web/src/pages"];

export async function checkUiCompleteness(root: string): Promise<UiFinding[]> {
  const findings: UiFinding[] = [];

  for (const dir of SCREEN_DIRS) {
    const glob = new Bun.Glob("**/*.tsx");
    for (const rel of glob.scanSync({ cwd: join(root, dir) })) {
      const file = `${dir}/${rel}`;
      const code = await Bun.file(join(root, file)).text();
      findings.push(...focusIndicator(file, code), ...listStates(file, code));
    }
  }

  findings.push(...(await themeSwitch(root)));
  return findings;
}

/**
 * R-32. `outline-none`/`outline: none` that is not paired with a ring or outline on the same
 * element removes the only signal a keyboard user has. The repo shipped a 1.83:1 ring once,
 * so "there is a ring" is not enough either — it must be a real `ring-*`/`outline-*` utility.
 */
function focusIndicator(file: string, code: string): UiFinding[] {
  const out: UiFinding[] = [];
  const classes = code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g);
  for (const m of classes) {
    const value = m[1] ?? m[2] ?? "";
    if (!/\boutline-none\b|\boutline:\s*none\b/.test(value)) continue;
    // `focus-visible:ring-*` / `focus:ring-*` / `focus-visible:outline-*` count as the replacement.
    if (/focus(-visible)?:(ring|outline)-/.test(value)) continue;
    out.push({
      file,
      rule: "FOCUS_NOT_VISIBLE",
      detail: "`outline-none` without a focus ring — keyboard users lose the cursor position",
    });
  }
  return out;
}

/**
 * R-27. A page that fetches a collection must branch on more than the happy path. The check is
 * deliberately loose (any of the usual markers) so it guides rather than dictates wording.
 */
function listStates(file: string, code: string): UiFinding[] {
  // Only a *rendered collection* owes the user states. A form that pulls the role list to fill
  // a dropdown is not a list view, so the check keys on the table primitives, not the fetch.
  const rendersList = /<ResourceTable|<DataTable/.test(code);
  if (!rendersList) return [];

  const hasPending = /isPending|isLoading|TableSkeleton|PageLoading|Loading\b/.test(code);
  const hasError = /isError|\berror\b/.test(code);
  const hasEmpty = /EmptyState|TableEmpty|cause="no-data"|no-data|length === 0/.test(code);

  const missing = [hasPending ? null : "loading", hasError ? null : "error", hasEmpty ? null : "empty"].filter(
    (x): x is string => x !== null,
  );

  if (missing.length === 0) return [];
  return [
    {
      file,
      rule: "UI_STATE_MISSING",
      detail: `list view has no ${missing.join("/")} state (R-27: empty, loading and error are part of the design)`,
    },
  ];
}

/**
 * R-34. `VITE_THEME` claims a second palette. Shipping a toggle whose other mode is identical
 * is worse than having no toggle: it promises a choice that does nothing.
 */
async function themeSwitch(root: string): Promise<UiFinding[]> {
  const config = await Bun.file(join(root, "apps/web/src/config/ui.ts")).text();
  const declared = /tinta-gelap/.test(config);
  if (!declared) return [];

  const css = await Bun.file(join(root, "apps/web/src/styles/globals.css")).text();
  // A second mode needs its own token block, selected by an attribute or media query.
  const hasSecondPalette = /\.dark\b|\[data-theme=|@media\s*\(prefers-color-scheme:\s*dark\)/.test(css);
  if (hasSecondPalette) return [];

  return [
    {
      file: "apps/web/src/config/ui.ts",
      rule: "THEME_NOT_IMPLEMENTED",
      detail:
        "`tinta-gelap` is offered by config but globals.css defines no second palette, so switching it changes nothing (R-34)",
    },
  ];
}
