# ADR-0012 — Agent runtime: Mastra deferred, not adopted

**Status:** Accepted

## Context

The template will eventually need background work and, after that, agent-style features
(tool-calling over ERP data). Mastra is the leading TypeScript agent framework, so F1.17
was written to settle whether it belongs in the foundation or is a Phase 8 fallback.

Two facts had to be established before deciding: whether Mastra runs on Bun at all (its
`engines` field declares `node >= 22.13.0`, which Bun does not satisfy), and what it costs.

## Findings

Verified by execution on Bun 1.4.2, `@mastra/core` 1.68.0:

- Import, `Agent` construction, `generate()`, and `stream()` (fully consumed) all work.
- `createWorkflow` + `createStep` + `run.start()` returns the expected result.
- `createTool` produces a callable tool.
- Installing emits no engine warning; Bun ignores the `node` constraint silently.

Cost measured: 148 packages, 192 MB of `node_modules`, of which `@mastra` is 80 MB.

Streaming was initially reported as broken. That was a wrong stub in the probe, not a
library defect: a hand-rolled model must emit `text-delta` parts carrying `delta`, and
Mastra ships `createMockModel` for exactly this. Driving the agent with Mastra's own mock
passes. Anyone repeating this test should use that helper rather than a custom stub.

## Decision

**Do not add Mastra to the template.** The foundation stays free of it.

Reasons: the template targets a 4 GB VPS and the repos built from it inherit whatever the
foundation ships; 192 MB of dependencies for a capability nothing currently calls is the
trade AGENTS.md rule 5 forbids. Mastra also declares support for Node only, so depending on
it means depending on Bun's tolerance of an unsupported runtime — acceptable to test, not
something to bake into a template handed to others.

Consequences:

- Background work (Phase 3) uses the queue interface from ADR-0011 §4 — BullMQ + Valkey on
  VPS, Cloudflare Queues on Workers. No agent framework is involved.
- When a concrete agent feature is specced, adopt Mastra then, behind one module, so the
  rest of the app stays unaware of it. Adding it is `bun add @mastra/core` and one module
  folder; the spike above shows what that module can rely on.
- The `node` engines declaration must be re-checked at adoption time. It is the most likely
  thing to break: Bun runs it today, but the vendor does not test it.

**Rejected alternatives:** adopting Mastra now (carries 192 MB and a runtime the vendor does
not support, for a capability with no spec); adopting a competing framework instead (same
cost class, no advantage established, and the decision can wait for a real requirement).
