# ADR-0012 — Agent runtime deferred

**Status:** Accepted; Mastra not installed.

Do not add an agent framework before a concrete feature requires it. The historical Bun spike
reported compatibility and substantial dependency cost; those measurements belong to
[task F1.17](../tasks/F1.17-mastra-smoke.md), not current runtime promises.

At adoption time recheck supported runtimes, exact version and cost; isolate behind a module.
Adding Mastra now or replacing it with another speculative framework was rejected.
