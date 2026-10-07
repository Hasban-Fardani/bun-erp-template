import { join } from "node:path";
import { directoryExists } from "./exists.ts";
import { type DesignDirectionSpec, DesignDirectionValidator } from "./governance/design-direction-validator.ts";

/**
 * Design gate. `design-direction-validator.ts` existed in the governance repo with 20+ measured
 * rules — and nothing called it, so the repo shipped `muted-subtitle-under-headline` twice while
 * the rule banning it sat one directory away. A rule nothing runs is documentation.
 *
 * A screen that renders UI must carry a spec in the design directory beside its pages. The spec is
 * small on purpose: surface class, the option chosen, the references actually opened and
 * measured, and the named device that makes the screen not generic.
 *
 * The spec must also *exist for every screen*: requiring only one spec is what let the login page
 * be reviewed while three other pages rendered without any declared direction. Installed apps and
 * the catalog copies are both scanned, and a screen whose file name maps to more than one page is
 * reported instead of silently sharing one spec.
 */

export type DesignFinding = { screen: string; code: string; severity: string; detail: string };

/** Layout and error routes render no screen of their own, so they carry no direction spec. */
const WEB_ROUTE_EXCLUDES = new Set(["__root.tsx", "_authenticated/route.tsx"]);

/**
 * Known gaps live in `design-exemptions.json` beside this gate, with a reason per screen. They are
 * data, not gate code: a screen stops being exempt by deleting its entry, and a malformed or
 * missing file fails the gate instead of silently disabling the rule.
 */
type DesignExemption = { screen: string; reason: string };

async function loadExemptions(): Promise<{ exempt: Set<string>; finding?: DesignFinding }> {
  const path = join(import.meta.dir, "design-exemptions.json");
  try {
    const raw = (await Bun.file(path).json()) as { screens?: unknown };
    if (!Array.isArray(raw.screens)) {
      return { exempt: new Set(), finding: exemptionFinding(`${path}: expected a "screens" array`) };
    }
    const exempt = new Set<string>();
    for (const entry of raw.screens as DesignExemption[]) {
      if (
        typeof entry?.screen !== "string" ||
        entry.screen.length === 0 ||
        typeof entry?.reason !== "string" ||
        entry.reason.trim().length === 0
      ) {
        return {
          exempt: new Set(),
          finding: exemptionFinding(`${path}: every exemption needs a screen and a non-empty reason`),
        };
      }
      exempt.add(entry.screen);
    }
    return { exempt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exempt: new Set(), finding: exemptionFinding(`${path}: ${message}`) };
  }
}

function exemptionFinding(detail: string): DesignFinding {
  return { screen: "design-exemptions", code: "EXEMPTIONS_UNREADABLE", severity: "BLOCKER", detail };
}

type ScreenSource = { sourceDir: string; designDir: string };

/** Installed apps plus every catalog copy: the template's own UI is the one most users copy. */
async function screenSources(root: string): Promise<ScreenSource[]> {
  const candidates: ScreenSource[] = [
    { sourceDir: "apps/web/src/pages", designDir: "apps/web/design" },
    { sourceDir: "apps/mobile/src/screens", designDir: "apps/mobile/design" },
    { sourceDir: "templates/apps/web/src/pages", designDir: "templates/apps/web/design" },
    { sourceDir: "templates/apps/mobile/src/screens", designDir: "templates/apps/mobile/design" },
  ];
  const webDirs = new Set<string>();
  for await (const file of new Bun.Glob("templates/features/*/web/pages/**/*.tsx").scan({ cwd: root })) {
    webDirs.add(file.slice(0, file.indexOf("/pages/")));
  }
  for (const webDir of webDirs) {
    candidates.push({ sourceDir: `${webDir}/pages`, designDir: `${webDir}/design` });
  }

  const sources: ScreenSource[] = [];
  for (const candidate of candidates) {
    if (await directoryExists(join(root, candidate.sourceDir))) sources.push(candidate);
  }
  return sources;
}

/**
 * Screens a user navigates to. A nested `index.tsx` is its directory's own route, so it is named
 * after the directory instead of collapsing every index page into one "overview" spec.
 */
function screenName(file: string, sourceDir: string): string | undefined {
  const isWeb = sourceDir.endsWith("/pages");
  if (!isWeb && !sourceDir.endsWith("/screens")) return undefined;
  const withoutExtension = file.replace(/\.tsx$/, "");
  const base = withoutExtension.slice(withoutExtension.lastIndexOf("/") + 1);
  if (withoutExtension === "_authenticated/index") return "overview";
  if (base !== "index") return base;
  const directory = withoutExtension.slice(0, withoutExtension.length - base.length).replace(/\/$/, "");
  return directory === "" ? "overview" : directory.split("/").join("-");
}

async function screenNames(root: string, sourceDir: string): Promise<Array<{ name: string; file: string }>> {
  const glob = new Bun.Glob("**/*.tsx");
  const screens: Array<{ name: string; file: string }> = [];
  for await (const file of glob.scan({ cwd: join(root, sourceDir) })) {
    if (sourceDir.endsWith("/pages") && WEB_ROUTE_EXCLUDES.has(file)) continue;
    const name = screenName(file, sourceDir);
    if (name) screens.push({ name, file });
  }
  return screens.sort((left, right) => left.name.localeCompare(right.name));
}

export async function checkDesign(root: string): Promise<DesignFinding[]> {
  const findings: DesignFinding[] = [];
  const { exempt, finding } = await loadExemptions();
  if (finding) findings.push(finding);

  for (const { sourceDir, designDir } of await screenSources(root)) {
    const dir = join(root, designDir);
    const declared = new Set<string>();

    if (await directoryExists(dir)) {
      for await (const file of new Bun.Glob("*.json").scan({ cwd: dir })) {
        const screen = file.replace(/\.json$/, "");
        declared.add(screen);
        try {
          const raw = (await Bun.file(join(dir, file)).json()) as DesignDirectionSpec;
          const result = DesignDirectionValidator.validate(raw);
          for (const violation of result.violations) {
            findings.push({ screen, code: violation.code, severity: violation.severity, detail: violation.message });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          findings.push({
            screen,
            code: "SPEC_UNREADABLE",
            severity: "BLOCKER",
            detail: `${designDir}/${file} is not a readable direction spec: ${message}`,
          });
        }
      }
    }

    const byName = new Map<string, string[]>();
    for (const { name, file } of await screenNames(root, sourceDir)) {
      byName.set(name, [...(byName.get(name) ?? []), file]);
    }
    for (const [name, files] of byName) {
      if (files.length > 1) {
        findings.push({
          screen: name,
          code: "SCREEN_NAME_COLLISION",
          severity: "BLOCKER",
          detail: `${files.map((file) => `${sourceDir}/${file}`).join(", ")} all map to the screen "${name}"; rename the page files so one spec cannot stand in for two screens`,
        });
        continue;
      }
      if (!declared.has(name) && !exempt.has(name)) {
        findings.push({
          screen: name,
          code: "SCREEN_WITHOUT_SPEC",
          severity: "BLOCKER",
          detail: `${sourceDir}/${files[0]} renders UI but has no direction in ${designDir}/${name}.json`,
        });
      }
    }
  }
  return findings;
}
