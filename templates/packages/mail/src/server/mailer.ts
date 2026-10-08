import { escapeHtml } from "./escape-html.ts";
import { createMailRegistry, type MailDriverRegistry } from "./registry.ts";
import type {
  MailAddress,
  MailAddressValue,
  MailConfig,
  MailDriver,
  MailEnqueue,
  Mailer,
  MailLogger,
  MailMessage,
  MailPayload,
  MailQueueOptions,
  MailSendResult,
  ResolvedMail,
} from "./types.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function addressValue(value: MailAddress, fallbackName = ""): MailAddressValue {
  const raw = typeof value === "string" ? { address: value } : value;
  const address = raw.address.trim();
  if (!EMAIL.test(address)) throw new Error(`Invalid email address: ${raw.address}`);
  return { address, name: (raw.name ?? fallbackName).trim() };
}

function addressList(value: MailAddress | MailAddress[] | undefined, label: string): MailAddressValue[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) throw new Error(`Mail ${label} must not be empty when provided`);
  return list.map((entry) => addressValue(entry));
}

/** A text/plain fallback so every driver has a readable alternative to HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(?:p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Apply config defaults and guarantee both bodies, so drivers never branch on missing fields. */
export function resolveMail(message: MailMessage, config: MailConfig): ResolvedMail {
  const from = message.from
    ? addressValue(message.from)
    : { address: config.MAIL_FROM_ADDRESS.trim(), name: config.MAIL_FROM_NAME.trim() };
  const html = message.html ?? (message.text ? `<pre>${escapeHtml(message.text)}</pre>` : "");
  if (html.trim() === "") throw new Error("Mail message needs html or text");
  return {
    from,
    to: addressList(message.to, "to"),
    cc: addressList(message.cc, "cc"),
    bcc: addressList(message.bcc, "bcc"),
    replyTo: message.replyTo ? addressValue(message.replyTo) : undefined,
    subject: requireSubject(message.subject),
    html,
    text: message.text ?? htmlToText(html),
    attachments: message.attachments ?? [],
    idempotencyKey: message.idempotencyKey,
  };
}

function requireSubject(subject: string): string {
  const value = subject.trim();
  if (!value) throw new Error("Mail subject is required");
  if (value.length > 240) throw new Error("Mail subject must not exceed 240 characters");
  return value;
}

/** Strip the resolved-only defaults back to the JSON payload a queue stores. */
function toPayload(message: MailMessage): MailPayload {
  return {
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
    from: message.from,
  };
}

export type CreateMailerOptions = {
  config: MailConfig;
  logger: MailLogger;
  /** Resolves the transport; defaults to the registry entry named by `config.MAIL_DRIVER`. */
  driver?: MailDriver;
  registry?: MailDriverRegistry;
  /** Writes a `mail.send` job; when absent, `queue()` sends inline. */
  enqueue?: MailEnqueue;
};

/**
 * Features call `ctx.mail.send()` for immediate delivery or `ctx.mail.queue()` to let the
 * worker retry transient SMTP failures. The queue path stores rendered HTML, so the worker
 * never needs React or an email renderer.
 */
export function createMailer(options: CreateMailerOptions): Mailer {
  const registry = options.registry ?? createMailRegistry();
  const driver =
    options.driver ?? registry.create(options.config.MAIL_DRIVER, { config: options.config, logger: options.logger });

  return {
    driver: driver.name,
    async send(message): Promise<MailSendResult> {
      return driver.send(resolveMail(message, options.config));
    },
    async verify(): Promise<void> {
      await driver.verify?.();
    },
    async queue(message: MailMessage, queueOptions: MailQueueOptions = {}): Promise<string> {
      if (!options.enqueue) return (await driver.send(resolveMail(message, options.config))).messageId;
      return options.enqueue({
        name: "mail.send",
        payload: toPayload(message),
        idempotencyKey: queueOptions.idempotencyKey,
        runAt: queueOptions.runAt,
      });
    },
  };
}
