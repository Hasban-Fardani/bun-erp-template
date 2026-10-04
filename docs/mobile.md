# React mobile with Capacitor

## Current foundation

apps/mobile packages the same apps/web React UI; it has no separate screen implementation.
Capacitor core/CLI/Android/iOS versions are pinned in its manifest. www is ignored build output.
The bundle uses relative asset paths and an absolute HTTPS API origin.
Capacitor supports packaging existing web apps: [official workflow](https://capacitorjs.com/docs/basics/workflow).

## Build assets

Set VITE_API_BASE_URL in the local environment to your HTTPS API origin (no /api/v1 suffix).
Then run:

```bash
bun erp mobile:build
```

This builds apps/mobile/www; ordinary bun erp build still creates apps/web/dist.
No API server is bundled into the app. Never use server.url to substitute a remote website
for packaged release assets. [Configuration reference](https://capacitorjs.com/docs/config).

## Create native projects in the copied application

Set MOBILE_APP_ID to an identifier you own in reverse-domain notation and MOBILE_APP_NAME
to the product name. Both are empty in the template. Bun loads the root local .env and passes
those values to Capacitor. Install the native tools from the
[environment guide](https://capacitorjs.com/docs/getting-started/environment-setup).

```bash
bun erp mobile:add android
bun erp mobile:add ios
bun erp mobile:sync android
bun erp mobile:sync ios
bun erp mobile:open android
bun erp mobile:open ios
```

Commit generated native projects in the copied application; keep build caches/signing secrets
ignored. Build before sync. Xcode/Android Studio/device builds, signing and store submission
are separate from this template's JavaScript verification.

## Authentication boundary

Web session auth is implemented. Native login is NOT_IMPLEMENTED/NOT_RUN: Capacitor origins
are capacitor://localhost on iOS and https://localhost on Android; current cookie/CORS behavior
is not sufficient evidence of device login. Token transport, secure native storage, explicit
origin/header policy and session expiry need an implemented/tested contract before release.
Do not enable a bearer plugin, broad CORS or cookie workarounds implicitly.

Device checks must cover login/logout/expiry, back navigation, keyboard, safe area, network
loss and plugins. Offline data sync, push and biometric features are outside this foundation.
