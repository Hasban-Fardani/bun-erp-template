# ADR-0007 — Audit allowlists

**Status:** Accepted; implemented.

Audit snapshots keep only entity-allowlisted fields. Secret/token/hash data is rejected even
if a field is allowlisted. Raw entity snapshots were rejected. Policies and snapshot filtering
are in `apps/server/features/audit`; logger redaction is a separate control.
