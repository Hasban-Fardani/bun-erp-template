import type { MailAddressValue, MailDriver, MailDriverFactory, MailSendResult, ResolvedMail } from "../types.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A failed send. `retryable` tells operators whether the queue's backoff can plausibly fix it. */
export class MailHttpError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(status: number) {
    super(`Mail provider rejected the request (HTTP ${status})`);
    this.name = "MailHttpError";
    this.code = `MAIL_HTTP_${status}`;
    // 4xx is the caller's fault except throttling and request timeout; 5xx and network errors may heal.
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

function formatAddress(value: MailAddressValue): string {
  return value.name ? `${value.name.replace(/[<>"\r\n]/g, "")} <${value.address}>` : value.address;
}

function resendBody(message: ResolvedMail): Record<string, unknown> {
  return {
    from: formatAddress(message.from),
    to: message.to.map(formatAddress),
    ...(message.cc.length > 0 ? { cc: message.cc.map(formatAddress) } : {}),
    ...(message.bcc.length > 0 ? { bcc: message.bcc.map(formatAddress) } : {}),
    ...(message.replyTo ? { reply_to: message.replyTo.address } : {}),
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.attachments.length > 0
      ? {
          attachments: message.attachments.map((file) => ({
            filename: file.filename,
            content: file.content,
            ...(file.contentType ? { content_type: file.contentType } : {}),
          })),
        }
      : {}),
  };
}

/**
 * HTTP mail API over `fetch`: the transport that works on both Bun and Cloudflare Workers (no raw
 * sockets). Resend is the only adapter; a project adds another by registering its own driver.
 * Failures throw a coded error whose message never contains the API key or the response body.
 */
export const httpMailDriver: MailDriverFactory = ({ config, fetch: fetchImpl }): MailDriver => {
  if (config.MAIL_HTTP_PROVIDER !== "resend") {
    throw new Error(`MAIL_HTTP_PROVIDER must be "resend" when MAIL_DRIVER=http (got "${config.MAIL_HTTP_PROVIDER}")`);
  }
  if (config.MAIL_API_KEY === "") throw new Error("MAIL_API_KEY is required when MAIL_DRIVER=http");
  const apiKey = config.MAIL_API_KEY;

  return {
    name: "http",
    async send(message): Promise<MailSendResult> {
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      };
      if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;
      let response: Response;
      try {
        response = await (fetchImpl ?? fetch)(RESEND_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify(resendBody(message)),
        });
      } catch {
        throw Object.assign(new Error("Mail provider unreachable"), { code: "MAIL_HTTP_NETWORK", retryable: true });
      }
      if (!response.ok) throw new MailHttpError(response.status);
      const body = (await response.json().catch(() => ({}))) as { id?: unknown };
      if (typeof body.id !== "string" || body.id === "") {
        throw Object.assign(new Error("Mail provider returned no message id"), {
          code: "MAIL_HTTP_BAD_RESPONSE",
          retryable: false,
        });
      }
      return { driver: "http", messageId: body.id };
    },
  };
};
