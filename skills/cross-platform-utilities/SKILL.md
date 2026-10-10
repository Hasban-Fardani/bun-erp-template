---
name: cross-platform-utilities
description: Use when deciding whether logic belongs in packages/utils or should remain inside a single app, feature, or runtime adapter.
---

# Cross-platform utility placement

Promote code to `packages/utils` only when at least two real workspaces need the same behavior and the implementation is pure TypeScript that works in Bun, Workers, browsers and Capacitor WebViews.

Keep React, DOM, filesystem, process, Bun-specific, database, Hono, Capacitor and feature-specific behavior out of this package. Runtime adapters stay inside their owning app or feature. Export stable functions from `src/index.ts`, add focused tests, and show real consumers in two applications before claiming it is shared. Run `bun loom check:architecture` and `bun loom test`.
