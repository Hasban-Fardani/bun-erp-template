---
name: ui-registry
description: Use when adding, replacing, or adapting a reusable UI component in packages/ui or an app screen that needs a new primitive.
---

# UI registry and atomic design

1. Search `packages/ui/src` and its imports before creating a component; extend an existing atom or molecule when it already owns the behavior.
2. Inspect the exact item before implementation. Only the aliases and URLs in `packages/ui/registry-allowlist.json` are installable: `@shadcn`, `@dashboardcn`, `@dashboardblocks`, `@emailcn`, and `@pdfcn`. Do not add registries without an owner decision and gate update.
3. Put reusable presentation in the smallest correct layer: atom, molecule, organism, then template. Application state, RPC, routing and feature rules stay in the consuming app or feature.
4. Record provenance in the catalog beside the source: `packages/ui/component-sources.json`, `dashboard-sources.json`, and `tanstack-sources.json` cover UI; `packages/email/component-sources.json` and `packages/pdf/component-sources.json` pin vendored files to an MIT-licensed commit. Custom compositions cite an official reference and explain their behavior.
5. Run `bun erp check:shadcn`, `bun erp check:architecture`, and the relevant UI tests. The registry gate must pass without weakening its allowlist.
