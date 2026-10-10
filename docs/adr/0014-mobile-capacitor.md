# ADR-0014 — Separate React applications, shared atomic UI

**Status:** Accepted; separate mobile entry/build, shared presentation and local offline storage implemented.

The owner clarified that mobile source must be separate from web. apps/mobile owns its
React entry, pages, Vite configuration and Capacitor project identity. apps/web retains
its own pages, routes and feature code. Both import @loom/ui; shared blocks accept
props rather than importing either application's hooks. The previous web-source packaging
approach is superseded by this requirement.

Atomic layers are atoms → molecules → organisms → templates → application pages.
A boundary gate prevents upward imports and cross-application source dependencies.
Native adapters belong to mobile when actual features require them. The offline feature uses encrypted
SQLite on native platforms and IndexedDB for browser development; it stores namespaced local records.
Automatic API sync is not implemented.

Application ID/name and API origin belong to the copied application. Native authentication and
business CRUD remain unimplemented. The CI artifact and release workflows do not prove device QA
or store approval. See [mobile](../mobile.md) for commands and release boundaries.
