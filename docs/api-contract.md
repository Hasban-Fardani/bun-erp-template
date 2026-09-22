# API contract

Every endpoint in this template follows the rules below. `bun erp check:readiness` fails when
this file or the code drifts from them, and `openapi-coverage.test.ts` fails when a route is not
documented at all.

## Response envelope

A successful response is always:

```json
{ "data": <payload>, "meta": { "requestId": "uuid" } }
```

A failure is always:

```json
{
  "error": { "code": "VALIDATION_FAILED", "message": "…", "fields": [{ "path": "email", "message": "…" }] },
  "meta": { "requestId": "uuid" }
}
```

- `meta.requestId` is present on every response, success or failure, and matches the
  `X-Request-Id` response header. Use it when tracing a report.
- `error.fields` appears only for validation failures.
- Nothing else is added to the envelope. A collection puts its pagination fields inside `data`,
  not beside it.

## Status codes

| Code | Meaning | Never means |
|---|---|---|
| 200 | Success | — |
| 400 | Malformed request body or JSON | a business rule failure |
| 401 | No session | insufficient permission |
| 403 | Valid session, missing permission | a missing row |
| 404 | Row not found **in the caller's organization** | forbidden |
| 409 | Conflict: the value is already taken | validation |
| 422 | Input validation failed, see `error.fields` | conflict |

401 and 403 are not interchangeable, and a missing row is always 404 rather than 403 — a 403
there would tell an attacker that the row exists elsewhere.

## Auth responses

`/api/v1/auth/*` is owned by Better Auth and does **not** use the envelope. Client code reads
it raw (see `features/users/api.ts`). Everything under `/api/v1/*` that this repo owns uses the
envelope without exception.

## Collections

Every collection endpoint accepts the same query contract and replies with the same `data` shape.

Query parameters:

| Parameter | Default | Notes |
|---|---|---|
| `page` | `1` | 1-based |
| `perPage` | `25` | max 100 |
| `sort` | per resource | must be in that resource's allowlist |
| `dir` | `asc` | `asc` or `desc` |
| `search` | – | where the resource supports it |

An unknown `sort` column is rejected with 422 rather than ignored: silently ordering by
something else is how a UI ends up contradicting its own header.

`data` shape:

```json
{ "items": [], "page": 1, "perPage": 25, "total": 0, "totalPages": 1 }
```

`totalPages` is at least 1 even when `total` is 0, so a client never renders "page 1 of 0".

## Naming

- Resources are plural nouns: `/api/v1/users`, `/api/v1/roles`, `/api/v1/audit-logs`.
- Field names are `camelCase` in JSON, `snake_case` in SQL. The mapping happens in the module's
  `data.ts`/`service.ts`, never in the client.
- An action that is not CRUD is an explicit sub-resource: `PUT /roles/{id}/permissions`,
  `POST /users/{id}/roles`.

## Errors thrown by handlers

Routes throw `ApiError`; `http/app.ts` renders it. A `catch` that swallows an error without a
log or a rethrow is a gate failure (`FAILURE-TRACEABILITY`), not a style choice.
