import { join } from "node:path";

/**
 * Interactive-surface gate: feedback must not reflow the page it interrupted.
 *
 * An inline alert under an element pushes content down and lands far from the control that
 * failed — on a table page, potentially a screen away. Feedback goes to a toast instead, which
 * appears next to the work and leaves on its own.
 *
 * The one exception is an error that must stay readable after a toast expires: a failed sign-in
 * puts the message directly above the submit button, because it describes the form the person is
 * still looking at. It is allowlisted by file below, not by pattern, so the exception stays
 * visible in review.
 */

/** Files where an inline error is deliberate and reviewed. */
const ALLOWED = new Set(["apps/web/src/pages/login-page.tsx"]);

/** Props/components that render feedback inside the layout. */
const INLINE_FEEDBACK = /\b(role="alert"|role=\{tone\s*===\s*"danger"\s*\?\s*"alert")/;

export type SurfaceFinding = { file: string; line: number; rule: string; detail: string };

export async function checkInteractiveSurface(root: string): Promise<SurfaceFinding[]> {
  const findings: SurfaceFinding[] = [];
  const glob = new Bun.Glob("apps/web/src/**/*.tsx");

  for await (const file of glob.scan({ cwd: root })) {
    if (ALLOWED.has(file)) continue;

    const raw = await Bun.file(join(root, file)).text();
    raw.split("\n").forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (!INLINE_FEEDBACK.test(line)) return;
      findings.push({
        file,
        line: index + 1,
        rule: "INLINE_ALERT",
        detail: "feedback must be a toast; an inline alert reflows the page and can land far from the control",
      });
    });
  }

  return findings;
}
