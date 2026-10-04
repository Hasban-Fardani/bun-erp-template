---
name: antislop-ui
description: Use when building or changing UI components, page layout, theme or feedback.
---

# UI rules

Use existing `apps/web/src/shared/ui` components and theme tokens. Read
[UI copy](../../docs/ui-copy.md) and [UI states](../../docs/ui-states.md).
This skill is self-contained; no external antislop core file is required.

- Start with the operator's task, permissions and recovery path.
- Keep layout/content truthful: no fabricated metrics, decorative activity or inert controls.
- A status/color/icon must communicate data or an action; avoid gradients/glows/badges without purpose.
- Keep typography, spacing, radii and surfaces consistent with the existing design system.
- Use explicit labels, keyboard access, visible focus, usable contrast and meaningful feedback.
- Distinguish loading, refetch, no rows, no match and error; preserve rows during refetch.
- Reuse toast, modal and sheet primitives; avoid new parallel UI systems.
- Respect reduced motion. Animation communicates a transition, not decoration.

Verify build and browser interactions, long values, empty/error states and both themes.
Responsive changes also load [mobile layout](../antislop-layoutmobile/SKILL.md).
`tools/*` owns enforced gate behavior; this guidance must not be used to silence a finding.
