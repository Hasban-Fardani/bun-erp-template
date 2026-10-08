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
- Superseded in part by the extension below.

## Extension: history, skills, tools

- `AI_HISTORY=full|summary|off` (default `full`) with `ai_conversations`/`ai_messages` (migration 0016);
  self-scoped like notifications.
- `features/ai/skills` and `features/ai/tools` are registries (`defineSkill`, `defineTool`): one file plus
  one list line. Tools are read-only, permission-checked per actor, capped by `AI_MAX_TOOL_CALLS`, results
  truncated to 2 KB, and run in one non-streaming planning step before the streamed answer, so CPU stays
  small on Workers Free while model latency is I/O.
- `Ai` gained an optional `plan()`; existing drivers and test doubles stay valid.
- Consequence: `full` history stores user content in the database; operators who must not should set
  `summary` or `off`. Real Workers AI function calling needs a Cloudflare account to verify.
