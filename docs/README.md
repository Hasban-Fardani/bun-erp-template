# Documentation map

Reviewed against source on 2026-10-04. Read only the branch needed for the task.
Package manifests and `bun erp --help` own versions and available commands.

| Need | Canonical document |
|---|---|
| Repo boundaries and request flow | [Architecture](architecture.md) |
| Code rules | [Conventions](conventions.md) |
| Local setup and owner | [Development](development.md) |
| API envelopes and pagination | [API contract](api-contract.md) |
| Auth, audit and secrets | [Security](security.md) |
| Checks, test database and QA | [Testing](testing.md) |
| Running services | [Operations](operations.md) |
| Shipping API/web | [Deployment](deployment.md) |
| React + Capacitor | [Mobile](mobile.md) |
| Copy and UI feedback | [UI copy](ui-copy.md), [UI states](ui-states.md) |
| CI and branch protection | [CI](ci.md) |
| Selected architecture versus implemented features | [ADRs](adr/README.md) |

`tasks/` stores work and review evidence, not a live feature list.
[Research](riset/README.md) is historical context; consult only for a specific investigation.
Do not treat an accepted ADR as proof its implementation exists.
