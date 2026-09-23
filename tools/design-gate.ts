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
 */

export type DesignFinding = { screen: string; code: string; severity: string; detail: string };

export async function checkDesign(root: string): Promise<DesignFinding[]> {
  const findings: DesignFinding[] = [];
  const dir = join(root, "apps/web/design");
  const glob = new Bun.Glob("*.json");

  let specs = 0;
  for await (const file of glob.scan({ cwd: dir })) {
    specs += 1;
    const raw = (await Bun.file(join(dir, file)).json()) as DesignDirectionSpec;
    const result = DesignDirectionValidator.validate(raw);
    for (const v of result.violations) {
      findings.push({
        screen: file.replace(/\.json$/, ""),
        code: v.code,
        severity: v.severity,
        detail: v.message,
      });
    }
  }

  // A screen with no spec at all is the original problem, not a passing state.
  if (specs === 0) {
    findings.push({
      screen: "(none)",
      code: "NO_DESIGN_SPEC",
      severity: "BLOCKER",
      detail: "apps/web/design/ has no spec; a screen that renders UI must declare its direction",
    });
  }

  return findings;
}
