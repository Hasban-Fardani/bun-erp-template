import { join } from "node:path";
import { directoryExists } from "./exists.ts";

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
 * missing branch is visible to them. The shared table component owns the states themselves. The
 * catalog copies are included because the template's own screens are what most users copy.
 */
const SCREEN_DIRS = [
  "apps/web/src/pages",
  "apps/mobile/src/screens",
  "packages/ui/src",
  "templates/apps/web/src/pages",
  "templates/apps/mobile/src/screens",
  "templates/features",
];

/** Catalog package sources are components, not screens: only the focus rule applies to them. */
const CATALOG_PACKAGE_GLOBS = ["templates/packages/*/src/**/*.tsx"];

export async function checkUiCompleteness(root: string): Promise<UiFinding[]> {
  const findings: UiFinding[] = [];

  for (const dir of SCREEN_DIRS) {
    const base = join(root, dir);
    // apps/mobile/src/screens only exists after `bun erp apps:create <name> mobile`.
    if (!(await directoryExists(base))) continue;
    const glob = new Bun.Glob("**/*.tsx");
    for (const rel of glob.scanSync({ cwd: base })) {
      const file = `${dir}/${rel}`;
      const code = await Bun.file(join(root, file)).text();
      findings.push(...focusIndicator(file, code));
      if (!dir.startsWith("packages/")) findings.push(...listStates(file, code));
    }
  }

  for (const pattern of CATALOG_PACKAGE_GLOBS) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: root })) {
      findings.push(...focusIndicator(file, await Bun.file(join(root, file)).text()));
    }
  }

  findings.push(...(await themeSwitch(root)));
  findings.push(...(await resourceTableFeedback(root)));
  return findings;
}

/**
 * R-27 (extended by the list-feedback audit). Two halves, checked separately so neither can
 * regress alone:
 *
 * - the shared `ResourceTable` must *declare* a visible refetch indicator, a clear-search control,
 *   and an error branch that accepts a retry action;
 * - every feature screen that mounts `ResourceTable` must *pass* `pending`, `error`, and `onRetry`,
 *   otherwise the affordances exist but are never wired.
 *
 * Markers are the stable ones the implementation actually uses (`data-testid="table-refreshing"`,
 * `clearSearch`, `onRetry`) rather than incidental wording, so the check guides instead of dictating.
 */
const TABLE_COMPONENTS = [
  "packages/data-table/src/ui/resource-table.tsx",
  "templates/packages/data-table/src/ui/resource-table.tsx",
];

async function resourceTableFeedback(root: string): Promise<UiFinding[]> {
  const out: UiFinding[] = [];

  for (const component of TABLE_COMPONENTS) {
    if (!(await Bun.file(join(root, component)).exists())) continue;
    const code = await Bun.file(join(root, component)).text();
    // A component that never renders rows owes the user nothing; keep this honest.
    if (/<DataTable|<table/.test(code)) {
      if (!/data-testid="table-refreshing"|labels\.refreshing/.test(code)) {
        out.push({
          file: component,
          rule: "TABLE_FEEDBACK_MISSING",
          detail:
            'no visible refetch indicator — add a `role="status"`/`data-testid="table-refreshing"` element that stays on screen while existing rows are preserved',
        });
      }
      if (!/clearSearch|table-search-clear/.test(code)) {
        out.push({
          file: component,
          rule: "TABLE_FEEDBACK_MISSING",
          detail:
            "no clear-search control — a filtered list must be resettable without deleting the query character by character",
        });
      }
      if (!/onRetry/.test(code)) {
        out.push({
          file: component,
          rule: "TABLE_FEEDBACK_MISSING",
          detail:
            "error branch accepts no retry action — a failed list must offer a way to recover in place, not only after a reload",
        });
      }
    }
  }

  // Feature screens are where `ResourceTable` is mounted; the route wrappers in `pages` never own it.
  const featureGlobs = [
    "apps/web/src/features/**/*.tsx",
    "templates/apps/web/src/features/**/*.tsx",
    "templates/features/*/web/**/*.tsx",
  ];
  for (const file of new Set(featureGlobs.flatMap((pattern) => [...new Bun.Glob(pattern).scanSync({ cwd: root })]))) {
    const code = await Bun.file(join(root, file)).text();
    if (!/<ResourceTable/.test(code)) continue;
    const missing = [
      /\bpending\s*=/.test(code) ? null : "pending (refetch)",
      /\berror\s*=/.test(code) ? null : "error",
      /\bonRetry\s*=/.test(code) ? null : "retry",
    ].filter((value): value is string => value !== null);
    if (missing.length === 0) continue;
    out.push({
      file,
      rule: "TABLE_FEEDBACK_MISSING",
      detail: `mounts ResourceTable without ${missing.join(" / ")}; the list must show refetch state, surface failure, and offer recovery`,
    });
  }

  return out;
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
  const out: UiFinding[] = [];
  // The catalog config ships the same claim as the installed app, so both are checked.
  for (const configPath of ["apps/web/src/config/ui.ts", "templates/apps/web/src/config/ui.ts"]) {
    if (!(await Bun.file(join(root, configPath)).exists())) continue;
    const config = await Bun.file(join(root, configPath)).text();
    if (!/"dark"/.test(config)) continue;

    const stylesheetPath = join(root, "packages/ui/src/styles.css");
    if (!(await Bun.file(stylesheetPath).exists())) {
      out.push({
        file: configPath,
        rule: "THEME_STYLESHEET_MISSING",
        detail: "`dark` is offered by config but the shared stylesheet is missing, so switching it changes nothing",
      });
      continue;
    }
    const css = await Bun.file(stylesheetPath).text();
    // A second mode needs its own token block, selected by an attribute or media query.
    if (/\.dark\b|\[data-theme=|@media\s*\(prefers-color-scheme:\s*dark\)/.test(css)) continue;

    out.push({
      file: configPath,
      rule: "THEME_NOT_IMPLEMENTED",
      detail:
        "`dark` is offered by config but the shared stylesheet defines no second palette, so switching it changes nothing (R-34)",
    });
  }
  return out;
}
