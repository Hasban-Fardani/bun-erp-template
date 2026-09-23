import { join } from "node:path";
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

/** Screens a user navigates to. Every one of them needs a declared direction. */
async function screenNames(root: string): Promise<string[]> {
  const glob = new Bun.Glob("*.tsx");
  const names: string[] = [];
  for await (const file of glob.scan({ cwd: join(root, "apps/web/src/pages") })) {
    const name = file.replace(/\.tsx$/, "");
    // The layout and error shells have no visual direction of their own.
    if (name === "not-found") continue;
    names.push(name);
  }
  return names.sort();
}

export async function checkDesign(root: string): Promise<DesignFinding[]> {
  const findings: DesignFinding[] = [];
  const dir = join(root, "apps/web/design");
  const glob = new Bun.Glob("*.json");
  const declared = new Set<string>();

  for await (const file of glob.scan({ cwd: dir })) {
    const screen = file.replace(/\.json$/, "");
    declared.add(screen);
    const raw = (await Bun.file(join(dir, file)).json()) as DesignDirectionSpec;
    const result = DesignDirectionValidator.validate(raw);
    for (const v of result.violations) {
      findings.push({ screen, code: v.code, severity: v.severity, detail: v.message });
    }
  }

  for (const screen of await screenNames(root)) {
    if (!declared.has(screen)) {
      findings.push({
        screen,
        code: "SCREEN_WITHOUT_SPEC",
        severity: "BLOCKER",
        detail: `apps/web/src/pages/${screen}.tsx renders UI but has no direction in apps/web/design/${screen}.json`,
      });
    }
  }

  return findings;
}
