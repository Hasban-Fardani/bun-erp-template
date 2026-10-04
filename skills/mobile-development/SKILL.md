---
name: mobile-development
description: Use when editing the React mobile app, Capacitor configuration, native build workflow, or mobile integration with the API.
---

# Mobile development

1. Keep the mobile entry in `apps/mobile/src/main.tsx` and screens under `apps/mobile/src/pages`.
2. Put native-only behavior in `apps/mobile`; import reusable presentation from `@bun-erp/ui`.
3. Use the typed client in `apps/mobile/src/lib/rpc.ts` and the shared server `AppType`. Keep API calls under `/api/v1`.
4. Send structured diagnostics through `apps/mobile/src/lib/logger.ts`; use event names and safe IDs. Keep credentials and user data out of logs.
5. Keep Capacitor core, platform packages and CLI on the same pinned version. Keep monorepo release versions aligned with the root manifest.
6. Store device-local records through `apps/mobile/src/features/offline`; native SQLite encryption is enabled, while browser IndexedDB is not encrypted.
7. Keep `server.url` out of packaged builds. Build the bundled web assets before Capacitor sync.
8. Validate with `bun erp check`, `bun erp test`, `bun erp mobile:build`, and the native CI artifact workflow. A JavaScript bundle does not prove an iOS/Android device build or native authentication.

Native login and secure token storage require their own tested contract. Store releases use `.github/workflows/mobile-release.yml`, which uploads Android to Play internal testing and iOS to TestFlight after the copied application configures signing credentials and store accounts.
