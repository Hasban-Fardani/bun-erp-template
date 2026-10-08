/**
 * The transport is app-agnostic: it receives its configuration, logger and queue writer from the
 * composition root, so the package never imports an app module. The app's validated `Env`
 * satisfies `MailConfig` structurally.
 */
export type MailConfig = {
  MAIL_DRIVER: string;
  MAIL_FROM_ADDRESS: string;
  MAIL_FROM_NAME: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USERNAME: string;
  SMTP_PASSWORD: string;
  /** `http` driver: which provider adapter formats the request. Only `resend` ships. */
  MAIL_HTTP_PROVIDER: string;
  /** `http` driver: provider API key (secret-class). */
  MAIL_API_KEY: string;
};

/** The one logger method the transport uses; an app's structured logger satisfies it. */
export type MailLogger = { info: (fields: Record<string, unknown>) => void };

/** An address is either a bare string or `{ address, name }`. */
export type MailAddress = string | { address: string; name?: string };

export type MailAddressValue = { address: string; name: string };

/** `content` is a base64 string so a queued message stays JSON-serializable. */
export type MailAttachment = { filename: string; content: string; contentType?: string };

export type MailMessage = {
  to: MailAddress | MailAddress[];
  cc?: MailAddress | MailAddress[];
  bcc?: MailAddress | MailAddress[];
  replyTo?: MailAddress;
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
  /** Overrides MAIL_FROM_ADDRESS/NAME for this message only. */
  from?: MailAddress;
  /** Forwarded to providers that dedupe sends (the `http` driver's Idempotency-Key header). */
  idempotencyKey?: string;
};

/** Everything a driver needs after defaults are applied and both bodies are present. */
export type ResolvedMail = {
  from: MailAddressValue;
  to: MailAddressValue[];
  cc: MailAddressValue[];
  bcc: MailAddressValue[];
  replyTo?: MailAddressValue;
  subject: string;
  html: string;
  text: string;
  attachments: MailAttachment[];
  idempotencyKey?: string;
};

export type MailSendResult = { driver: string; messageId: string };

/** The seam every transport implements. Adding a driver is one factory plus a registry entry. */
export type MailDriver = {
  readonly name: string;
  send(message: ResolvedMail): Promise<MailSendResult>;
};

export type MailDriverContext = {
  config: MailConfig;
  logger: MailLogger;
  /** HTTP drivers call this instead of the global, so tests and Workers can inject it. */
  fetch?: typeof fetch;
};
export type MailDriverFactory = (context: MailDriverContext) => MailDriver;

export type MailQueueOptions = { idempotencyKey?: string; runAt?: Date };

/** What `createMailer` exposes to features. `queue` falls back to `send` without a transport. */
export type Mailer = {
  readonly driver: string;
  send(message: MailMessage): Promise<MailSendResult>;
  queue(message: MailMessage, options?: MailQueueOptions): Promise<string>;
};

/** The JSON-safe shape stored in a `mail.send` job payload. */
export type MailPayload = {
  subject: string;
  to: MailAddress | MailAddress[];
  cc?: MailAddress | MailAddress[];
  bcc?: MailAddress | MailAddress[];
  replyTo?: MailAddress;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
  from?: MailAddress;
};

/** The app-side queue writer; absent means `queue()` sends inline. */
export type MailEnqueue = (input: {
  name: "mail.send";
  payload: MailPayload;
  idempotencyKey?: string;
  runAt?: Date;
}) => Promise<string>;
