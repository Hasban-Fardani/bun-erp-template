# API contract

Sources: `http/helpers/errors.ts`, `routes/api.ts`, module routes and `http/helpers/list-query.ts`.
`openapi-coverage.test.ts` checks coverage; `check:prod` checks this document's presence and
required terms, not the full behavior. `bun erp --help` owns command names.

Business success: `{ data, meta: { requestId } }`.
Application error: `{ error: { code, message, fields?, details? }, meta: { requestId } }`.
`fields` is an array of `{ path, message }`; validation errors include it. `details` carries
machine-readable extras such as `{ currentVersion }` on a stale optimistic-locking write.
For enveloped requests the request ID matches `X-Request-Id`.

Exceptions: Better Auth `/api/v1/auth/*` owns its responses; health/readiness return direct
status objects; OpenAPI/docs are public documentation endpoints. Do not assume every response
is wrapped. Web business requests use RPC `call()`; auth uses `lib/auth.ts`.

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Malformed JSON |
| 401 | No session |
| 403 | Session lacks permission |
| 404 | Row absent |
| 409 | State/unique conflict |
| 422 | Input validation; field array |
| 500 | Internal failure; details stay in logs |

Collections accept page ≥1 (default 1), perPage 1–100 (default 25), allowlisted sort,
asc/desc direction and optional search. Audit defaults to descending createdAt; other
resource defaults live in their schemas. Unsupported sort produces 422.
Data: `{ items, page, perPage, total, totalPages }`; totalPages is at least 1.
JSON fields are camelCase, SQL fields snake_case.
`PUT /users/:id/roles` replaces a user's roles atomically; POST/DELETE manage assignments.

## Versioning

The current public contract is `/api/v1`. `apps/server/routes/api.ts` owns the prefix, and
Hono derives the `AppType` RPC contract from the same registered route chain. Web and mobile
clients import that type only; both call `rpc` under the `api.v1` chain.

Keep existing paths, methods, status meanings, permissions, field meanings, and response
envelopes stable. Additive optional response fields and new endpoints are compatible changes.
Treat removing or renaming a route/field, making an optional request field required, changing
an enum's meaning, or changing authorization/error semantics as breaking.

A breaking change adds `/api/v2` beside v1 and keeps both route chains available during
migration. Give each version its own typed Hono route tree and generated client contract. Move one
client at a time, then remove v1 only after a published deprecation window and a release decision.
Do not silently change `API_PREFIX` or reuse a v1 path for a new meaning.

Every version keeps the same outer response envelope and 401/403/404 distinction. Contract
tests exercise the prefix and representative response shapes; `bun erp check:rpc` blocks a
missing v1 prefix or a client that stops consuming the typed route contract.

Mobile and web use the same `/api/v1` origin. Native login remains unimplemented until a
separate token/session contract is designed and tested; RPC typing alone does not establish
native authentication.
