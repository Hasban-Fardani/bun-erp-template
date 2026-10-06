# Logging

Each record is one JSON object with a timestamp, level, service/area, release, event name and
useful identifiers. Server HTTP failures include the Hono request ID, method, route, status and
duration. Mobile requests send an `X-Request-Id`; the response envelope returns the same ID.

Log events describe state transitions and failures, not full request bodies. Passwords, tokens,
cookies, authorization headers, personal identifiers and user-entered values stay out of logs.
Server Pino redaction and the mobile logger enforce common sensitive-key rules. Worker logs use
the same structured shape and go to Cloudflare's console sink.

Use stable event names such as `http.request.slow_or_failed` and attach low-risk fields such as
`requestId`, `method`, `path`, `status`, `duration_ms` and release. Route paths must not contain
record values; use the registered route template if one is available. Keep success logs quiet,
and log an error once at the boundary that can act on it. Never log a secret to explain a failure.

Mobile code calls `createMobileLogger(area)` from `apps/mobile/src/lib/logger.ts` (install the catalog
app with `bun erp apps:create <name> mobile` first). The mobile
gate blocks direct `console` calls elsewhere. Debug events are disabled in production builds.
