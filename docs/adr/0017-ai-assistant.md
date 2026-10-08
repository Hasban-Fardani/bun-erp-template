# ADR-0017 — Built-in AI assistant with portable drivers

**Status:** Accepted and implemented.

## Context

The template targets Cloudflare Workers Free first and a plain VPS second, and must move between
them without a rewrite. A simple question-and-answer assistant should exist from the first install,
not as an opt-in package, and it must stay inside the Free plan's CPU and AI allowances for a demo.

## Decision

- `apps/server/infra/ai` exposes one `Ai` interface (`stream`, `complete`, `available`) on
  `AppContext` as `ctx.ai`. Drivers: `workers-ai` (Worker binding, or the OpenAI-compatible REST
  endpoint off Cloudflare), `openai` (any OpenAI-compatible base URL), `fake` and `off`.
- No SDK dependency: both providers speak server-sent events, read by a small parser
  (`infra/ai/sse.ts`). This keeps the Worker bundle small and the behaviour identical on both
  targets.
- `features/ai` serves `GET /status` and a streaming `POST /chat` behind the `ai.use` permission,
  with a per-user daily quota on the existing `api_rate_limits` table.
- The web shell mounts the assistant panel for sessions holding `ai.use`.

## Consequences

- A fresh install shows the assistant; without credentials on Bun it reports "not set up" rather
  than failing boot. On Cloudflare the deploy preflight requires the `ai` binding while the driver
  is `workers-ai`.
- Conversations are not stored. Persisted threads, tool calls and data access are later decisions.
