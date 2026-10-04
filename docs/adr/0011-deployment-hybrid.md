# ADR-0011 — Separate static UI and portable API

**Status:** Accepted; hybrid layout implemented, Worker adapter not implemented.

React web ships as static assets separately from the Bun API. Cloudflare static hosting is
an allowed target, not proof of a deployed service. API portability requires environment
configuration, PostgreSQL/object storage, stdout logs and a separate entrypoint from createApp.

Current Bun context still couples migrations, drivers and logging to Bun; startup runs
migrations. Worker/Hyperdrive refactoring and measurements remain pending. Full Workers now
and permanently VPS-only architectures were rejected.

Future queue adapters: BullMQ/Valkey on VPS; a supported Workers queue on Workers. No queue
implementation is present. Do not import a concrete queue into domain modules preemptively.
