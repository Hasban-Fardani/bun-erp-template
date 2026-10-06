# API contract

Sources: `http/helpers/errors.ts`, `routes/api.ts`, module routes and `http/helpers/list-query.ts`.
`openapi-coverage.test.ts` checks coverage; `check:prod` checks this document's presence and
required terms, not the full behavior. `bun erp --help` owns command names.

Business success: `{ data, meta: { requestId } }`.
Application error: `{ error: { code, message, fields? }, meta: { requestId } }`.
`fields` is an array of `{ path, message }`; validation and conflict errors may include it.
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
