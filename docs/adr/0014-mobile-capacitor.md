# ADR-0014 — Shared React UI with Capacitor packaging

**Status:** Accepted by the mobile-template request; packaging foundation implemented.

Reuse apps/web React screens, RPC and Query code. apps/mobile owns Capacitor configuration,
native identity and packaging; its www output is built from web source with relative assets.
This avoids maintaining two copies of the same application. Native plugins belong behind
small adapters when an actual feature needs them.

Application ID/name and API origin belong to the copied application. No production identity,
native project, signing key or store release is embedded here. Capacitor versions are pinned
in its manifest. Native auth, plugin features and device validation are not implemented.
See [mobile](../mobile.md) for commands and release boundaries.
