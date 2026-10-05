import type { Env } from "../config/index.ts";
import type { Logger } from "../observability/logger.ts";

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
};

export type MailSendResult = { driver: string; messageId: string };

/** The seam every transport implements. Adding a driver is one factory plus a registry entry. */
export type MailDriver = {
  readonly name: string;
  send(message: ResolvedMail): Promise<MailSendResult>;
};

export type MailDriverContext = { env: Env; logger: Logger };
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

export type MailEnqueue = (input: {
  name: "mail.send";
  payload: MailPayload;
  idempotencyKey?: string;
  runAt?: Date;
}) => Promise<string>;
