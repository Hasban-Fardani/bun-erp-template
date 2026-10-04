# ADR-0001 — TanStack file routing

**Status:** Accepted and implemented.

TanStack Router integrates with Query. The Vite plugin scans apps/web/src/pages and generates
routeTree.gen.ts. Each route file declares one typed createFileRoute() value so the generator can
provide route IDs and type-safe links. Developers never edit the generated route tree or maintain a
second registration list.

Route files are kept small under pages; screen code lives in web feature folders. The plugin enables
autoCodeSplitting so route screens load in separate chunks. The authenticated route is a pathless
directory layout defined by _authenticated/route.tsx.

React Router was rejected because typed Hono RPC and Query integration needed a shared router context.
See docs/architecture.md for current paths and conventions.
