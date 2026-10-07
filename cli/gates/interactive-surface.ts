import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

/**
 * Interactive-surface gate: transient feedback should not reflow a page.
 *
 * A toast suits transient success and action feedback. An error that must remain visible beside
 * a form or stale data should stay in that context so it remains available after navigation or
 * after a toast would have expired.
 *
 * Contextual inline errors are allowlisted by file, so each new use is reviewed rather than
 * accepted by a broad pattern.
 */

/** Files where a persistent error belongs next to the form or data it describes. */
const CONTEXTUAL_ERRORS = new Set([
  "apps/web/src/features/identity/screens/login.tsx",
  // Installed by the roles catalog feature; reviewed when it lands in apps/web.
  "apps/web/src/features/roles/components/role-sheet.tsx",
  "apps/mobile/src/features/offline/components/offline-drafts.tsx",
  "packages/ui/src/molecules/form-errors.tsx",
]);

/** Reusable alert and field-validation primitives are reviewed separately from app usage. */
const REVIEWED_FEEDBACK_COMPONENTS = new Set([
  "packages/ui/src/molecules/alert.tsx",
  "packages/ui/src/molecules/field-primitives.tsx",
  "packages/ui/src/organisms/questionnaire.tsx",
]);

/** Props/components that render feedback inside the layout. */
const INLINE_FEEDBACK = /\b(role="alert"|role=\{tone\s*===\s*"danger"\s*\?\s*"alert")/;

export type SurfaceFinding = { file: string; line: number; rule: string; detail: string };

export async function checkInteractiveSurface(root: string): Promise<SurfaceFinding[]> {
  const findings: SurfaceFinding[] = [];
  const index = fileIndex(root);
  const files: string[] = [];
  for (const dir of ["apps/web/src", "apps/mobile/src", "packages/ui/src"]) {
    // apps/mobile/src only exists after `bun erp apps:create <name> mobile`.
    if (!(await directoryExists(join(root, dir)))) continue;
    files.push(...(await index.files(`${dir}/**/*.tsx`)));
  }

  for (const file of files) {
    if (CONTEXTUAL_ERRORS.has(file) || REVIEWED_FEEDBACK_COMPONENTS.has(file)) continue;

    const raw = await index.text(file);
    raw.split("\n").forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (!INLINE_FEEDBACK.test(line)) return;
      findings.push({
        file,
        line: index + 1,
        rule: "INLINE_ALERT",
        detail:
          "use a toast for transient feedback; persistent contextual errors require a reviewed file allowlist entry",
      });
    });
  }

  return findings;
}
