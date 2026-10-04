# React mobile with Capacitor

## Source ownership

apps/mobile has a distinct React entry at src/main.tsx, screens under src/pages and its own Vite
build. Feature-specific code lives under src/features. It imports shared presentation from
packages/ui and pure cross-platform functions from packages/utils; it never imports apps/web source.
There is no shared web entry or web screen copied into the mobile app.

The mobile RPC client uses the server Hono AppType under /api/v1 and sends a request ID. Native
authentication is not implemented; cookie behavior has not been validated on device.

## Offline records

The offline feature at apps/mobile/src/features/offline owns a namespaced JSON record store and a
reference local-drafts screen. Native iOS/Android builds use @capacitor-community/sqlite with
SQLCipher encryption and the plugin's secure secret storage. Browser development falls back to
IndexedDB, which is not encrypted. Do not cache credentials or high-risk data in that browser store.

Drafts are device-local and are not uploaded or synchronized. A future feature must define an API
idempotency contract, authorization behavior, conflict policy and deletion lifecycle before it
adds automatic sync. Offline indicators are advisory; the app must still handle a request that
fails after the browser reports a connection.

The SQLite plugin uses SQLCipher on native platforms and may trigger export-compliance duties.
Review Apple's encryption export guidance before submitting an app. Native encryption configuration
does not prove device-level key handling or a successful release build.

## Develop and build

Run bun erp mobile:dev for the separate mobile app on port 5174. Set VITE_API_BASE_URL to an HTTPS
API origin with no path, then run bun erp mobile:build. Output is apps/mobile/www. Ordinary
bun erp build creates only apps/web/dist.

Packaged mobile builds load bundled assets. Do not configure server.url to load a remote web app.
Set MOBILE_APP_ID and MOBILE_APP_NAME in the copied application before generating native projects.
The template contains no production identity, signing key or store secret.

## Logging and versions

Use createMobileLogger(area) from apps/mobile/src/lib/logger.ts. It writes structured events,
redacts credentials and personal fields, and disables debug events in release builds. Keep
Capacitor core, platform packages and CLI on the same exact version. Workspace release versions
are checked by bun erp check:versioning.

## Motion

Use `useSoftAutoAnimate` from `@bun-erp/ui/lib/use-auto-animate.ts` for short lists whose rows are
added, removed or reordered. It uses the same reduced-motion-aware preset as web. Stable keys are
required; keep the native screen responsive and avoid animating whole page transitions.

## CI and release

.github/workflows/mobile-build.yml creates an Android debug APK and iOS simulator artifact.
.github/workflows/mobile-release.yml uploads signed Android builds to Google Play internal testing
and iOS builds to TestFlight when the copied project supplies signing/store credentials. It does not
promote a public production release. Native CI artifacts are not proof of device QA or store approval.
