# ADR-0001 — TanStack Router

**Status:** Accepted; partially implemented.

TanStack Router is selected with Query and typed search validation; React Router was rejected.
File-based generation/loaders are the selected direction but are not implemented: current source
is `apps/web/src/routes/route-tree.tsx`, with component guards and manual table URL state.
Do not report generated routes as available until code and checks demonstrate them.
