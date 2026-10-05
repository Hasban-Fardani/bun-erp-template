/**
 * Motion gate. The UI/UX audit found motion that ignored `prefers-reduced-motion`: a looping
 * spinner and pulse with no escape, and overlay keyframes declared without a disable block. A
 * rule that only lives in prose regresses, so this reads the source instead.
 *
 * The scope is deliberately narrow to stay a signal rather than noise:
 *
 * - inline keyframe animation in JSX is always a blocker: it bypasses the shared stylesheet and
 *   has no reduced-motion escape;
 * - continuous Tailwind loops (`animate-spin|ping|pulse|bounce`) need a reduced-motion counterpart
 *   (`motion-safe:`/`motion-reduce:`), or an accessible alternative in the same element that
 *   already carries the meaning (`role="status"`, `aria-live`, `aria-hidden` decoration);
 * - `packages/ui/src/styles.css` must disable every authored keyframe animation used by a
 *   `[data-slot]` surface under a global `@media (prefers-reduced-motion: reduce)` block.
 *
 * One-shot enter/exit utilities (`animate-in`, `animate-out`) are intentionally not flagged here:
 * they are brief, state-gated, and supplied by shadcn primitives; flagging every vendored overlay
 * would be noise. The authored overlays this repo controls are covered by the stylesheet rule.
 */

export type MotionFinding = { file: string; rule: string; detail: string };

const UI_GLOBS = ["packages/ui/src/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"];

/** Looping utilities: the motion repeats forever, so reduced motion must be able to stop it. */
const LOOPING_ANIMATIONS = /(?<![\w-])animate-(spin|ping|pulse|bounce)(?![\w-])/g;

/** A reduced-motion variant on the same class expression is the explicit escape. */
const MOTION_ESCAPE = /\bmotion-(?:safe|reduce):/;

/** An accessible alternative in the same element that already carries the animation's meaning. */
const ACCESSIBLE_ALTERNATIVE =
  /\b(?:aria-hidden|aria-live|aria-busy)|\brole=(?:"(?:status|alert)"|\{[^}]*"(?:status|alert)")/;

/**
 * Primitives reviewed as purely decorative placeholders. Their loop conveys no information and the
 * loading meaning is carried by the parent `role="status"`, so there is nothing for reduced motion
 * to remove. Kept as an explicit one-file list so a new decorative loop must be reviewed, not
 * silently added.
 */
const DECORATIVE_PRIMITIVES = new Set(["packages/ui/src/atoms/skeleton.tsx"]);

export async function checkMotion(root: string): Promise<MotionFinding[]> {
  const findings: MotionFinding[] = [];
  findings.push(...(await stylesheetGuard(root)));

  const files = [...new Set(UI_GLOBS.flatMap((pattern) => [...new Bun.Glob(pattern).scanSync({ cwd: root })]))];
  for (const file of files) {
    const code = await Bun.file(`${root}/${file}`).text();
    findings.push(...inlineAnimation(file, code));
    if (!DECORATIVE_PRIMITIVES.has(file)) findings.push(...loopingAnimation(file, code));
  }
  return findings;
}

/** Inline `style={{ animation: ... }}` has no reduced-motion escape and duplicates the stylesheet. */
function inlineAnimation(file: string, code: string): MotionFinding[] {
  const out: MotionFinding[] = [];
  for (const match of code.matchAll(/\bstyle\s*=\s*\{\{[^}]*\banimation(?:Name)?\s*:/gs)) {
    const line = code.slice(0, match.index).split("\n").length;
    out.push({
      file,
      rule: "INLINE_ANIMATION_UNGUARDED",
      detail: `line ${line}: inline keyframe animation bypasses the shared stylesheet and its reduced-motion guard; move the keyframe into packages/ui/src/styles.css and gate it with \`animation: none\` under prefers-reduced-motion`,
    });
  }
  return out;
}

/** A looping Tailwind animation must be escapable or redundant with accessible text. */
function loopingAnimation(file: string, code: string): MotionFinding[] {
  const out: MotionFinding[] = [];
  for (const match of code.matchAll(LOOPING_ANIMATIONS)) {
    const name = match[1] ?? "";
    const start = Math.max(0, match.index - 400);
    const end = Math.min(code.length, match.index + 400);
    const context = code.slice(start, end);
    if (MOTION_ESCAPE.test(context) || ACCESSIBLE_ALTERNATIVE.test(context)) continue;
    const line = code.slice(0, match.index).split("\n").length;
    out.push({
      file,
      rule: "ANIMATE_WITHOUT_REDUCED_MOTION",
      detail: `line ${line}: \`animate-${name}\` loops with no reduced-motion escape; use \`motion-safe:animate-${name}\` or pair it with \`motion-reduce:animate-none\``,
    });
  }
  return out;
}

/**
 * The stylesheet must declare one global reduced-motion block and use it to disable every authored
 * animation-bearing selector (the `[data-slot]` surfaces and named entrance classes).
 */
async function stylesheetGuard(root: string): Promise<MotionFinding[]> {
  const file = "packages/ui/src/styles.css";
  if (!(await Bun.file(`${root}/${file}`).exists())) return [];
  const css = await Bun.file(`${root}/${file}`).text();

  const reduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!reduce?.[1]) {
    return [
      {
        file,
        rule: "REDUCED_MOTION_GUARD_MISSING",
        detail:
          "no global `@media (prefers-reduced-motion: reduce)` block; authored animations keep running for users who asked for reduced motion",
      },
    ];
  }
  const reduceBody = reduce[1];
  const base = css.replace(reduce[0], "");
  const findings: MotionFinding[] = [];

  for (const selector of animationSelectors(base)) {
    if (new RegExp(escapeRegExp(selector)).test(reduceBody)) continue;
    if (selector.startsWith("[data-slot") && /\[data-slot\]/.test(reduceBody)) continue;
    findings.push({
      file,
      rule: "REDUCED_MOTION_SURFACE_UNCOVERED",
      detail: `${selector} animates but the reduced-motion block never disables it; add it (or a broader \`[data-slot]\` rule) with \`animation: none\``,
    });
  }
  return findings;
}

/** Selectors that declare an animation, as the tokens the reduced-motion block must neutralize. */
function animationSelectors(css: string): Set<string> {
  const selectors = new Set<string>();
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (block[1] ?? "").trim();
    const body = block[2] ?? "";
    if (/@(?:media|keyframes)/.test(selector)) continue;
    if (!/\banimation(?:-name)?\s*:/.test(body)) continue;
    for (const slot of selector.matchAll(/\[data-slot=["']?([\w-]+)["']?\]/g)) {
      selectors.add(`[data-slot="${slot[1]}"]`);
    }
    for (const className of selector.matchAll(/\.([\w-]+)/g)) {
      selectors.add(`.${className[1]}`);
    }
  }
  return selectors;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
