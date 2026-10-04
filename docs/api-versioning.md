# API versioning

The current public contract is `/api/v1`. `apps/server/http/routes.ts` owns the prefix, and
Hono derives the `AppType` RPC contract from the same registered route chain. Web and mobile
clients import that type only; both call `rpc` under the `api.v1` chain.

## Changes allowed in v1

Keep existing paths, methods, status meanings, permissions, field meanings, and response
envelopes stable. Additive optional response fields and new endpoints are compatible changes.
Treat removing or renaming a route/field, making an optional request field required, changing
an enum's meaning, or changing authorization/error semantics as breaking.

## Breaking changes

Add `/api/v2` beside v1 and keep both route chains available during migration. Give each version
its own typed Hono route tree and generated client contract. Move one client at a time, then
remove v1 only after a published deprecation window and a release decision. Do not silently
change `API_PREFIX` or reuse a v1 path for a new meaning.

Every version keeps the same outer response envelope and 401/403/404 distinction. Contract
tests exercise the prefix and representative response shapes; `bun erp check:rpc` blocks a
missing v1 prefix or a client that stops consuming the typed route contract.

Mobile and web use the same `/api/v1` origin. Native login remains unimplemented until a
separate token/session contract is designed and tested; RPC typing alone does not establish
native authentication.
