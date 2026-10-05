---
name: antislop-ui
description: Use when building or changing UI components, page layout, theme or feedback.
---

# UI rules

Use existing `packages/ui/src` atomic components and theme tokens. Read
[UI copy](../../docs/ui-copy.md) and [UI states](../../docs/ui-states.md).
This skill is self-contained; no external antislop core file is required.

- Start with the operator's task, permissions and recovery path.
- Keep layout/content truthful: no fabricated metrics, decorative activity or inert controls.
- A status/color/icon must communicate data or an action; avoid gradients/glows/badges without purpose.
- Keep typography, spacing, radii and surfaces consistent with the existing design system.
- Use explicit labels, keyboard access, visible focus, usable contrast and meaningful feedback.
- Distinguish loading, refetch, no rows, no match and error; preserve rows during refetch.
- Every data list shows all five states: loading, refetch (rows stay visible with a pending indicator), empty, no-match, and error. `bun erp check:gate ui` enforces `TABLE_FEEDBACK_MISSING`.
- A list/search error offers an in-place retry action; "reload the page" is not recovery.
- Search is clearable with its own affordance, so a filtered list resets without deleting the query character by character.
- Reuse toast, modal and sheet primitives; avoid new parallel UI systems.
- Motion uses the shared duration/easing values in `packages/ui/src/styles.css`; do not invent inline keyframes or magic durations. Animation communicates a transition, not decoration.
- Respect reduced motion: authored keyframes are disabled under `prefers-reduced-motion: reduce`, and looping utilities use `motion-safe:` or a reduced-motion escape (`bun erp check:gate motion`).
- A second palette is only "shipped" when a runtime switch selects it; a palette that cannot be reached changes nothing.

Verify build and browser interactions, long values, empty/error states and both themes.
Responsive changes also load [mobile layout](../antislop-layoutmobile/SKILL.md).
`tools/*` owns enforced gate behavior; this guidance must not be used to silence a finding.
