# ADR-0009 — Email/password and Google sign-in

**Status:** Accepted; superseded the earlier "dormant Google" decision on 2026-10-08.

Email/password stays on by default. Google sign-in turns on when both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set: the login screen then shows "Continue with Google" (it reads the
enabled methods from the public `GET /api/v1/auth-options`). The schema refuses a single Google key.

`AUTH_PASSWORD_ENABLED=false` makes sign-in Google-only, which costs no password hashing and is the
lightest choice on Cloudflare Workers Free; the schema refuses it without both Google keys, and
`bun loom user:create` then generates an unusable password instead of asking for one.

Accounts are still provisioned: with `AUTH_SIGNUP_ENABLED=false` an unknown Google account is refused
(`disableImplicitSignUp`), and a Google account whose verified email matches an existing user links
to that user (`trustedProviders: ["google"]`), keeping its roles. The earlier objection to a mixed
login was that it shipped no UI; the button, the options endpoint and the refusal path now exist.
