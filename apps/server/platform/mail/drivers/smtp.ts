import { createUuid } from "@bun-erp/utils";
import type { Transporter } from "nodemailer";
import type { MailAttachment, MailDriver, MailDriverFactory, MailSendResult, ResolvedMail } from "../types.ts";

function attachment(message: MailAttachment) {
  return {
    filename: message.filename,
    content: Buffer.from(message.content, "base64"),
    contentType: message.contentType,
  };
}

/**
 * SMTP is a Bun/Node transport: Workers have no raw sockets, so the config schema refuses
 * MAIL_DRIVER=smtp when APP_DEPLOY_TARGET=cloudflare. The import stays lazy so a log-only
 * deployment never loads nodemailer.
 */
export const smtpMailDriver: MailDriverFactory = ({ env }): MailDriver => {
  let transport: Promise<Transporter> | undefined;

  async function getTransport(): Promise<Transporter> {
    transport ??= (async () => {
      try {
        const { createTransport } = await import("nodemailer");
        return createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USERNAME ? { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD } : undefined,
        });
      } catch (error) {
        throw new Error(
          `SMTP transport unavailable on this runtime (${error instanceof Error ? error.message : String(error)}). ` +
            "Use MAIL_DRIVER=log, or register an HTTP-based mail driver.",
        );
      }
    })();
    return transport;
  }

  return {
    name: "smtp",
    async send(message: ResolvedMail): Promise<MailSendResult> {
      const client = await getTransport();
      const info = await client.sendMail({
        from: message.from.name ? { address: message.from.address, name: message.from.name } : message.from.address,
        to: message.to,
        cc: message.cc.length > 0 ? message.cc : undefined,
        bcc: message.bcc.length > 0 ? message.bcc : undefined,
        replyTo: message.replyTo?.address,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments.map(attachment),
      });
      return { driver: "smtp", messageId: info.messageId || createUuid() };
    },
  };
};
