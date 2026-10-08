# AI assistant

Every install ships a chat assistant: an **AI assistant** page in the sidebar and an **Ask AI** quick panel
(⌘/Ctrl+J; a side panel on desktop, a bottom sheet on phones). Answers stream in as they are generated. It is core,
not a catalog feature, and it runs on both targets without code changes.

## Drivers

`AI_DRIVER` picks the provider; the server code (`ctx.ai`) is the same for all of them.

| `AI_DRIVER` | Cloudflare Workers | Bun / VPS | Settings |
|---|---|---|---|
| `workers-ai` (default) | the Worker's `AI` binding (`wrangler.jsonc` → `"ai"`) | the same models over Workers AI's OpenAI-compatible REST endpoint | Workers: nothing. Bun: `AI_ACCOUNT_ID` + `AI_API_KEY` (API token with *Workers AI: Read*) |
| `openai` | any OpenAI-compatible API | same | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (OpenAI, Groq, OpenRouter, a local Ollama at `http://localhost:11434/v1`) |
| `fake` | offline echo | same | none; for tests and keyless local work |
| `off` | the panel says the assistant is not set up | same | none |

`AI_MODEL` empty means `@cf/meta/llama-3.1-8b-instruct-fast` on Workers AI. `AI_MAX_TOKENS`
(default 768) caps one answer.

**Moving between targets.** `workers-ai` keeps the provider when the app moves: on the Worker it
uses the binding, on a VPS it calls the same model over REST. To leave Cloudflare entirely, switch
to `openai`. No feature code changes.

## Cost and limits

- Each user may ask `AI_DAILY_LIMIT` questions per UTC day (default 50). The counter lives in the
  shared `api_rate_limits` table, so it holds across replicas and Worker isolates. The limit answers
  `429` with `Retry-After`.
- Workers AI Free includes 10,000 Neurons a day; a short answer from the default 8B model costs a
  few Neurons, so the default limit suits a demo. Raise it, or move to Workers Paid, for real use.
- Streaming waits on the provider, not on the CPU; Worker CPU time per question stays small on the
  Free plan.

## History

`AI_HISTORY` decides what a conversation keeps (default `full`):

| Mode | Stored | Notes |
|---|---|---|
| `full` | `ai_conversations` + every turn in `ai_messages` | The server loads prior turns itself (newest 12) and ignores the client's copy. Regenerate and edit send `replaceFrom` to drop a stored turn and everything after it. |
| `summary` | the conversation row: title + a rolling summary (about 80 words, one extra short completion per answer) | Turns are not stored; the browser shows the current session only. A resumed conversation hands the summary to the model. |
| `off` | nothing | `GET /ai/conversations` is empty. |

Conversations are self-scoped like notifications: every query filters on the signed-in user, so
another user's id is a `404`. The title is the first question, shortened. Message content is never
logged or audited.

## Skills

A skill is a named instruction set picked with `/` at the start of the composer. Add one by creating
`apps/server/features/ai/skills/<name>.ts` with `defineSkill({ key, title, description, instructions,
permission? })` and listing it in `skills/index.ts`. `permission` (a typed `PermissionKey`) hides it from
other actors. Shipped: `summarize`, `write-email`, `translate`. `GET /ai/skills` lists what the actor may
use; `POST /ai/chat` with an unknown `skill` is `422`, a forbidden one `403`. Instructions are appended to
the server-owned system prompt. A question with a skill skips tool planning.

## Tools

Tools let the assistant read data for the signed-in user. Add one in `apps/server/features/ai/tools/` with
`defineTool({ name, description, parameters (zod), permission?, run(ctx, actor, args) })` and list it in
`tools/index.ts`. Rules the code enforces:

- read-only by contract; `run` must scope its query to the actor;
- offered to the model only if the actor holds `permission`, and checked again before running;
- at most `AI_MAX_TOOL_CALLS` (default 3) calls per question; arguments are validated; each result is
  JSON truncated to 2 KB; a failing tool becomes a short error result, never a crash;
- `AI_TOOLS_ENABLED=false` skips the planning step entirely.

Shipped: `unread_notifications` (no permission) and `find_users` (`user.read`, 5 rows, id/name/email).

Flow: one non-streaming planning call with the tools, the server runs the calls, then the final answer
streams. If the model needs no tool its planning text is the answer (no second generation). A planning
failure falls back to a plain streamed answer. The planning step uses `AI_TOOL_MODEL`; on Workers AI it
defaults to `@hf/nousresearch/hermes-2-pro-mistral-7b`, a documented function-calling model (the default
chat model is not one). On `openai` it uses `AI_MODEL`. Request shape: the binding takes a flat
`tools: [{ name, description, parameters }]` and answers `tool_calls: [{ name, arguments }]`; REST and
OpenAI use `tools: [{ type: "function", function }]` and `tool_calls[].function`. Tool results go back to
the answering model inside the system prompt as data.

Workers Free budget: tools add one extra model call per question (about 1 to 2 Neurons-scale for a small
prompt, the same order as an answer) and only milliseconds of CPU, since waiting on the model or the
database is I/O. Set `AI_TOOLS_ENABLED=false` to stay at one model call per question.

## Permission and privacy

- `ai.use` gates the pages and the API. The `staff` and `owner` system roles hold it.
- Without tools the assistant cannot see data; with tools it sees only what a tool returns for that user.

## API

- `GET /ai/status` gives `{ available, driver, dailyLimit, remaining, history, toolsEnabled }`.
- `GET /ai/skills`, and `GET /ai/conversations` (paginated, newest first), `GET|PATCH|DELETE /ai/conversations/:id`.
- `POST /ai/chat` with `{ messages, conversationId?, skill?, replaceFrom? }` (the last turn is the question)
  answers `text/event-stream`: `conversation` `{ id, title, userMessageId }` (history on), `tool`
  `{ name, status: running|done|error }`, `delta` `{ text }`, then `done`
  `{ remaining, conversationId, userMessageId, assistantMessageId }`, or `error` `{ message }`. Refusals
  before the first byte use the JSON envelope: `401`, `403`, `404`, `422`, `429`, `503`.

## Web

`/assistant` is a page inside the normal ERP shell: conversations in a collapsible column (a drawer on
phones), a reading column, a pinned composer. ⌘/Ctrl+J opens the quick panel, which shares its state with
the page; "Open in full view" continues the same conversation (`?c=<id>`).

## Using AI in a feature

`ctx.ai` is available everywhere `ctx` is:

```ts
const summary = await ctx.ai.complete({
  messages: [
    { role: "system", content: "Summarize in two sentences." },
    { role: "user", content: invoice.notes },
  ],
});
```

Use `ctx.ai.stream(request)` for an `AsyncIterable<string>`. Check `ctx.ai.available` first and
answer `503` when it is false. In tests, `AI_DRIVER=fake` (the fixture default) answers offline.
