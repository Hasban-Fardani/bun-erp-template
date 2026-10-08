# AI assistant

Every install ships a chat assistant: an **Ask AI** button in the top bar (⌘/Ctrl+J) opens a side
panel on desktop and a bottom sheet on phones. Answers stream in as they are generated. It is core,
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

## Permission and privacy

- `ai.use` gates the panel and the API. The `staff` and `owner` system roles hold it; remove it from a
  role to hide the assistant.
- The assistant has no tools and no data access yet. Its system prompt (`features/ai/service.ts`)
  tells it so, and the panel says it cannot see the user's data.
- No chat history is stored. The browser keeps the conversation for the open tab and sends at most
  the last 20 turns with each question.

## API

- `GET /api/v1/ai/status` → `{ available, driver, dailyLimit, remaining }`.
- `POST /api/v1/ai/chat` with `{ messages: [{ role: "user" | "assistant", content }] }` (the last turn
  is the question) answers `text/event-stream`: `delta` `{ text }` per chunk, then `done`
  `{ remaining }`, or `error` `{ message }` if the provider fails mid-answer. Refusals before the
  first byte use the JSON error envelope: `401`, `403`, `422`, `429`, `503`.

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
