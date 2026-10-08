# Mobile application

Catalog copy of the React + Capacitor shell (`@bun-erp/mobile`). `bun erp init` installs it at
`apps/mobile` (or `bun erp apps:create mobile mobile`); once installed it owns `src/main.tsx`, the
mobile screens and features, and never imports web source. Offline records use the mobile offline
feature and stay on device until a sync contract is defined. Without a server app the RPC client is
a detached stub; a later `bun erp init` that includes the server re-fits it.
Setup, commands and native boundaries live in the repository `docs/mobile.md`.
Capacitor console logging is off in packaged builds; set `MOBILE_LOGGING=debug` for a native debug
run to forward webview logs.
Application identity belongs to the copied project; generated www is not source.
