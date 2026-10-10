import { createUuid } from "@loom/utils";
import type { Transporter } from "nodemailer";
import type { MailAttachment, MailDriver, MailDriverFactory, MailSendResult, ResolvedMail } from "../types.ts";

const NODEMAILER: string = "nodemailer";

function attachment(message: MailAttachment) {
  return {
    filename: message.filename,
    content: Buffer.from(message.content, "base64"),
    contentType: message.contentType,
  };
}

/** A failed SMTP call. `retryable` is false for bad credentials, bad envelopes and 5xx replies. */
export function classifySmtpError(error: unknown): Error & { code: string; retryable: boolean } {
  const source = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const nodemailerCode = typeof source.code === "string" ? source.code : "";
  const reply = typeof source.responseCode === "number" ? source.responseCode : undefined;
  const permanent =
    nodemailerCode === "EAUTH" || nodemailerCode === "EENVELOPE" || (reply !== undefined && reply >= 500);
  const suffix = reply !== undefined ? String(reply) : nodemailerCode.replace(/[^A-Z0-9]/g, "") || "FAILED";
  const message = typeof source.message === "string" && source.message !== "" ? source.message : "SMTP failed";
  return Object.assign(new Error(message), { code: `MAIL_SMTP_${suffix}`, retryable: !permanent });
}

/**
 * SMTP is a Bun/Node transport: Workers have no raw sockets, so the app's config schema refuses
 * MAIL_DRIVER=smtp when APP_DEPLOY_TARGET=cloudflare. The import stays lazy so a log-only
 * deployment never loads nodemailer.
 */
export const smtpMailDriver: MailDriverFactory = ({ config }): MailDriver => {
  let transport: Promise<Transporter> | undefined;

  async function getTransport(): Promise<Transporter> {
    transport ??= (async () => {
      try {
        // A non-literal specifier keeps nodemailer (and its node:dns/net/child_process imports) out of
        // the Cloudflare Worker bundle; Bun resolves it at runtime like any other import.
        const { createTransport } = (await import(NODEMAILER)) as typeof import("nodemailer");
        return createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          auth: config.SMTP_USERNAME ? { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD } : undefined,
        });
      } catch (error) {
        throw new Error(
          `SMTP transport unavailable on this runtime (${error instanceof Error ? error.message : String(error)}). ` +
            "Use MAIL_DRIVER=http (Resend over fetch) or MAIL_DRIVER=log.",
        );
      }
    })();
    return transport;
  }

  return {
    name: "smtp",
    async verify(): Promise<void> {
      const client = await getTransport();
      try {
        await client.verify();
      } catch (error) {
        throw classifySmtpError(error);
      }
    },
    async send(message: ResolvedMail): Promise<MailSendResult> {
      const client = await getTransport();
      try {
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
          // SMTP has no idempotency header: a stable Message-ID lets the receiver or a log search spot a re-send.
          messageId: message.idempotencyKey ? stableMessageId(message.idempotencyKey, message.from.address) : undefined,
        });
        return { driver: "smtp", messageId: info.messageId || createUuid() };
      } catch (error) {
        throw classifySmtpError(error);
      }
    },
  };
};

function stableMessageId(key: string, fromAddress: string): string {
  const domain = fromAddress.split("@")[1] ?? "localhost";
  return `<${key.replace(/[^A-Za-z0-9._-]/g, "-")}@${domain}>`;
}
