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
- `apps/server/features/mail/wiring.ts` — app adapter: `createMailEnqueue(db)`, `createAppMailer`,
  `registerMailJobs`.
- `apps/server/features/mail/channel.ts` — the notifications `mail` channel.
- `apps/server/tests/features/mail/mail.test.ts` — worker delivery and channel integration tests.

Wiring edits (all deterministic, all fail the install when an anchor is missing):

- `apps/server/package.json` gains the `@bun-erp/mail` workspace dependency.
- `apps/server/bootstrap/context.ts` gains `mail: Mailer`.
- `apps/server/bootstrap/bootstrap.ts` and `cloudflare-context.ts` build it through
  `createAppMailer`.
- `apps/server/features/jobs.ts` registers the `mail.send` job.
- `apps/server/features/notifications/types.ts` and `channels/registry.ts` add the `mail` channel.

## Configure

`MAIL_DRIVER` selects the transport: `log` (default, structured line only), `smtp` (nodemailer;
refused on Cloudflare Workers) or a custom registered driver. `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`
and `SMTP_*` are read from the same validated environment; the keys exist in the app config schema
whether or not this feature is installed.

## Verify

```
bun erp check
bun test apps/server/tests/features/mail
```

Removing the feature is manual: delete `packages/mail`, `apps/server/features/mail` and its test,
then revert the wiring edits listed above and run `bun install`.
