export { MailHttpError } from "./drivers/http.ts";
export { createMemoryMailDriver } from "./drivers/memory.ts";
export { escapeHtml } from "./escape-html.ts";
export { type CreateMailerOptions, createMailer, htmlToText, resolveMail } from "./mailer.ts";
export { createMailRegistry, MailDriverRegistry } from "./registry.ts";
export type {
  MailAddress,
  MailAddressValue,
  MailAttachment,
  MailConfig,
  MailDriver,
  MailDriverContext,
  MailDriverFactory,
  MailEnqueue,
  Mailer,
  MailLogger,
  MailMessage,
  MailPayload,
  MailQueueOptions,
  MailSendResult,
  ResolvedMail,
} from "./types.ts";
