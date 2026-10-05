import { createUuid } from "@bun-erp/utils";
import type { MailDriver, MailDriverFactory, MailSendResult, ResolvedMail } from "../types.ts";

function recipients(message: ResolvedMail): string[] {
  return [...message.to, ...message.cc, ...message.bcc].map((entry) => entry.address);
}

/**
 * The default development driver: a structured log line, no transport. It records the
 * recipients and subject so a missing mail server is visible, never silent.
 */
export const logMailDriver: MailDriverFactory = ({ logger }): MailDriver => ({
  name: "log",
  async send(message): Promise<MailSendResult> {
    const messageId = createUuid();
    logger.info({
      event: "mail.sent",
      driver: "log",
      message_id: messageId,
      to: recipients(message),
      subject: message.subject,
      bytes: message.html.length,
      attachments: message.attachments.length,
    });
    return { driver: "log", messageId };
  },
});
