# Documentation index

Use this index to select only the context needed for a change. Source code, package manifests and
bun erp --help define current behavior. An ADR records a decision; it is not proof that the
decision has been implemented.

| Need | Canonical document |
|---|---|
| Find files and understand request flow | [Architecture](architecture.md) |
| Code and migration rules | [Conventions](conventions.md), [database skill](../skills/database-drizzle/SKILL.md) |
| Clone, configure, run locally and set up agent tooling | [Development](development.md) |
| API envelope, pagination and versioning | [API contract](api-contract.md) |
| Auth, RBAC, audit and secrets | [Security](security.md) |
| Queue behavior, logs, health and backup | [Operations](operations.md) |
| CI, deployment targets and releases | [CI](ci.md), [Deployment](deployment.md) |
| Quality gates and how to add one | [Gates](gates.md) |
| Mobile structure, offline storage and native builds | [Mobile](mobile.md) |
| UI states, feedback and interaction copy | [UI states](ui-states.md) |
| Accessible list motion | [Mobile](mobile.md), [shared UI package guide](../packages/ui/llms.txt) |
| Shared localization and locale behavior | [Internationalization](i18n.md) |
| Reusable package boundaries and imports | [Architecture](architecture.md), each package's package.json exports |
| Architecture decisions | [ADR index](adr/README.md) |

`docs/tasks/` records work and verification with human-owned status. It is not current
implementation guidance; consult it only when reviewing the referenced historical change.
