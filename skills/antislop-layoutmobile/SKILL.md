---
name: antislop-layoutmobile
description: Use when changing responsive layouts, touch interaction or Capacitor presentation.
---

# Responsive and mobile layout

Share React components between web and mobile; packaging is in `apps/mobile`.
Read [mobile](../../docs/mobile.md) for native boundaries and
[UI states](../../docs/ui-states.md) for feedback. No missing antislop core is required.

- Let content determine breakpoints; grids stack and children can shrink (`min-width: 0`).
- Contain wide tables/code locally; never hide page overflow to conceal clipped controls.
- Forms must survive small widths, long values, text enlargement and keyboard opening.
- Touch actions need a practical 44px hit area and spacing; do not rely on hover.
- Use dynamic viewport sizing where appropriate and preserve content behind sticky controls.
- Account for native safe areas before claiming a device layout works.
- Navigation, dialogs and sheets remain keyboard/touch accessible with preserved focus.

Check at phone/tablet/desktop widths, reduced motion and both themes. Browser mobile emulation
is viewport evidence only; iOS/Android keyboard, safe area, back navigation and plugins need
actual native execution. Do not introduce client workflows or fake data into the template.
