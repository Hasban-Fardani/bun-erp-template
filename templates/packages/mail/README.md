# `@loom/mail`

Server-only mail transport for the Bun ERP workspace. The package is app-agnostic: `createMailer`
receives its configuration, logger and queue writer, so it never imports an app module. The default
server ships no mail; install this package through its catalog feature:

```
bun loom features:install mail
```

That single command copies `packages/mail`, declares the `@loom/mail` workspace dependency on
`apps/server`, copies the app-side wiring (`apps/server/features/mail/`), and wires `ctx.mail`, the
`mail.send` job and the notifications `mail` channel. `bun loom packages:install mail` alone only
copies the package; use the feature install to land a working setup.

```ts
import { createMailer } from "@loom/mail/server";

const mail = createMailer({ config: env, logger, enqueue: writeMailJob });
await mail.send({ to: "user@example.test", subject: "Halo", html: "<p>Halo</p>" });
await mail.queue({ to: "user@example.test", subject: "Halo", text: "Halo" });
```

`to`/`cc`/`bcc` accept a string or `{ address, name }`. `html` is optional when `text` is present,
and a plain-text body is derived from the HTML otherwise. `queue` stores the rendered payload as a
`mail.send` job when an `enqueue` writer is provided, and falls back to inline delivery otherwise.

## Exports

- `@loom/mail/server`: `createMailer`, `createMailRegistry`, `MailDriverRegistry`, `resolveMail`,
  `htmlToText`, `escapeHtml`, and the `Mailer`/`MailMessage`/`MailConfig` types.
- `@loom/mail/llms.txt`: concise model-oriented package map.

## Drivers

Transport is selected by `MAIL_DRIVER` and resolved through `MailDriverRegistry`, so a project can
register its own HTTP provider without editing the package:

- `log` (default) writes a structured `mail.sent` line and sends nothing — visible, never silent.
- `smtp` sends through `nodemailer` using `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USERNAME`/
  `SMTP_PASSWORD`. It needs raw sockets, so the app config refuses it when
  `APP_DEPLOY_TARGET=cloudflare`; use `http` there.
- `http` posts to the Resend API over `fetch` (`MAIL_HTTP_PROVIDER=resend`, `MAIL_API_KEY`), so it works on
  Bun and Cloudflare Workers. A provider error throws a coded error (`MAIL_HTTP_<status>`, or
  `MAIL_HTTP_NETWORK`) with a `retryable` flag; the message never contains the key or the response body, and
  the queue retries it with backoff. `idempotencyKey` is forwarded as the `Idempotency-Key` header (the job
  handler sets `mail.send:<jobId>`), so a retry after a lost response is not delivered twice.
- `memory` captures messages in-process and is the seam tests assert against.

## Tests

```
bun test tests
```

The package suite covers message resolution, the driver registry, the log driver, custom drivers,
and the queue payload. Worker delivery and the notifications channel are integration concerns and
live in the catalog feature's `tests/mail.test.ts`, which runs after installation.
