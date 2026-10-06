import { join } from "node:path";
import { directoryExists } from "./exists.ts";
import { type DesignDirectionSpec, DesignDirectionValidator } from "./governance/design-direction-validator.ts";

/**
 * Design gate. `design-direction-validator.ts` existed in the governance repo with 20+ measured
 * rules — and nothing called it, so the repo shipped `muted-subtitle-under-headline` twice while
 * the rule banning it sat one directory away. A rule nothing runs is documentation.
 *
 * A screen that renders UI must carry a spec in `apps/web/design/<screen>.json`. The spec is
 * small on purpose: surface class, the option chosen, the references actually opened and
 * measured, and the named device that makes the screen not generic.
 *
 * The spec must also *exist for every screen*: requiring only one spec is what let the login page
 * be reviewed while three other pages rendered without any declared direction.
 */

export type DesignFinding = { screen: string; code: string; severity: string; detail: string };

/** Layout and error routes render no screen of their own, so they carry no direction spec. */
const WEB_ROUTE_EXCLUDES = new Set(["__root.tsx", "_authenticated/route.tsx"]);
/**
 * Known gap, kept visible on purpose: the inbox screen renders UI but has no direction spec yet.
 * Listing it here (instead of silently skipping unknown files) means a *new* page still fails the
 * gate until it ships a spec.
 */
const WEB_SCREENS_WITHOUT_SPEC = new Set(["notifications"]);

/** Screens a user navigates to. Every one of them needs a declared direction. */
async function screenNames(root: string, sourceDir: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.tsx");
  const names: string[] = [];
  for await (const file of glob.scan({ cwd: join(root, sourceDir) })) {
    if (sourceDir === "apps/web/src/pages") {
      if (WEB_ROUTE_EXCLUDES.has(file)) continue;
      const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.tsx$/, "");
      if (WEB_SCREENS_WITHOUT_SPEC.has(base)) continue;
      names.push(base === "index" ? "overview" : base);
      continue;
    }
    if (file === "home.tsx") names.push("home");
  }
  return names.sort();
}

export async function checkDesign(root: string): Promise<DesignFinding[]> {
  const findings: DesignFinding[] = [];
  for (const [sourceDir, designDir] of [
    ["apps/web/src/pages", "apps/web/design"],
    ["apps/mobile/src/screens", "apps/mobile/design"],
  ]) {
    if (!(await directoryExists(join(root, sourceDir ?? "")))) continue;
    const dir = join(root, designDir ?? "");
    const glob = new Bun.Glob("*.json");
    const declared = new Set<string>();

    if (await directoryExists(dir)) {
      for await (const file of glob.scan({ cwd: dir })) {
        const screen = file.replace(/\.json$/, "");
        declared.add(screen);
        const raw = (await Bun.file(join(dir, file)).json()) as DesignDirectionSpec;
        const result = DesignDirectionValidator.validate(raw);
        for (const v of result.violations) {
          findings.push({ screen, code: v.code, severity: v.severity, detail: v.message });
        }
      }
    }

    for (const screen of await screenNames(root, sourceDir ?? "")) {
      if (!declared.has(screen)) {
        findings.push({
          screen,
          code: "SCREEN_WITHOUT_SPEC",
          severity: "BLOCKER",
          detail: `${sourceDir}/${screen}.tsx renders UI but has no direction in ${designDir}/${screen}.json`,
        });
      }
    }
  }
  return findings;
}
