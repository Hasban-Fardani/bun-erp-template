export { registerMailJobs } from "./job.ts";
export { type CreateMailerOptions, createMailEnqueue, createMailer, htmlToText, resolveMail } from "./mailer.ts";
export { createMailRegistry, MailDriverRegistry } from "./registry.ts";
export type {
  MailAddress,
  MailAddressValue,
  MailAttachment,
  MailDriver,
  MailDriverContext,
  MailDriverFactory,
  MailEnqueue,
  Mailer,
  MailMessage,
  MailPayload,
  MailQueueOptions,
  MailSendResult,
  ResolvedMail,
} from "./types.ts";
