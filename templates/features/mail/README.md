# Mail

Opt-in server infrastructure. The default server ships no mail at all: only the database
notification channel exists. This feature installs the `@bun-erp/mail` catalog package and wires it
into the composition root:

```
bun erp features:install mail
```

What installs:

- `packages/mail` (`@bun-erp/mail`) — app-agnostic transport: driver registry, `log`/`memory`/`smtp`
  drivers, `resolveMail`/`htmlToText`/`escapeHtml`. `nodemailer` is its dependency.
- `apps/server/features/mail/index.ts` — the public surface other features import (feature-boundary rule).
- `apps/server/features/mail/wiring.ts` — app adapter: `createMailEnqueue(db)`, `createAppMailer`,
  `registerMailJobs`.
- `apps/server/features/mail/channel.ts` — the notifications `mail` channel.
- `apps/server/features/mail/password-reset.ts` — the Better Auth `sendResetPassword` sender: it enqueues a
  durable `mail.send` job, never sends inline (see [security](../../docs/security.md#password-reset)).
- `apps/server/tests/features/mail/{mail,password-reset}.test.ts` — worker delivery, channel and reset-flow tests.

Wiring edits (all deterministic, all fail the install when an anchor is missing):

- `apps/server/package.json` gains the `@bun-erp/mail` workspace dependency.
- `apps/server/bootstrap/context.ts` gains `mail: Mailer`.
- `apps/server/bootstrap/bootstrap.ts` and `cloudflare-context.ts` build it through
  `createAppMailer`.
- `apps/server/features/jobs.ts` registers the `mail.send` job.
- `apps/server/features/notifications/types.ts` and `channels/registry.ts` add the `mail` channel.
- `apps/server/features/identity/auth.ts` sets `sendResetPassword`, which turns password reset on.

## Configure

`MAIL_DRIVER` selects the transport:

| Driver | Use | Cloudflare Workers |
|---|---|---|
| `log` (default) | development; writes a structured line, sends nothing | allowed (nothing is delivered) |
| `smtp` | Bun/VPS through nodemailer (`SMTP_*`) | refused by the config schema |
| `http` | Resend over `fetch`: `MAIL_HTTP_PROVIDER=resend`, `MAIL_API_KEY` (secret) | supported |

`memory` is registry-only (tests), not a valid `MAIL_DRIVER` value. The sender address comes from
`MAIL_FROM_ADDRESS` and `MAIL_FROM_NAME`. On Cloudflare set `MAIL_API_KEY` with `wrangler secret put`; it is
redacted in `env:list`. All keys live in the core config schema whether or not this feature is installed.

Production password reset needs `MAIL_DRIVER=http` or `smtp`: with `log` the reset link is only written to the
log of the worker, so nobody receives it.

## Verify

```
bun erp check
bun test apps/server/tests/features/mail
```

Removing the feature is manual: delete `packages/mail`, `apps/server/features/mail` and its test,
then revert the wiring edits listed above and run `bun install`.
