import { escapeHtml } from "@loom/mail/server";
import type { Database } from "../../database/index.ts";
import { enqueueJob } from "../../infra/jobs/queue.ts";

type ResetInput = { user: { email: string; name?: string | null }; url: string; token: string };

/**
 * Better Auth `sendResetPassword`: stores a durable `mail.send` job instead of sending inline, so a
 * slow or failing provider never changes the HTTP response and the worker retries delivery.
 *
 * Better Auth only calls this for an existing account and answers the same 200 either way, which
 * keeps the endpoint free of an account-enumeration signal. The idempotency key is derived from a
 * hash of the token (never the token itself), so a retried request cannot enqueue the same link twice.
 */
export function createPasswordResetSender(db: Database) {
  return async ({ user, url, token }: ResetInput): Promise<void> => {
    await enqueueJob(db, {
      name: "mail.send",
      payload: {
        to: user.email,
        subject: "Reset your password / Atur ulang kata sandi",
        text: resetText(url),
        html: resetHtml(url),
      },
      idempotencyKey: `password-reset:${await fingerprint(token)}`,
    });
  };
}

function resetText(url: string): string {
  return [
    "We received a request to reset your password. Open the link below within one hour.",
    "Kami menerima permintaan untuk mengatur ulang kata sandi Anda. Buka tautan di bawah dalam waktu satu jam.",
    "",
    url,
    "",
    "If you did not ask for this, ignore this email. / Abaikan email ini jika Anda tidak memintanya.",
  ].join("\n");
}

function resetHtml(url: string): string {
  const href = escapeHtml(url);
  return [
    "<p>We received a request to reset your password. Open the link below within one hour.</p>",
    "<p>Kami menerima permintaan untuk mengatur ulang kata sandi Anda. Buka tautan di bawah dalam waktu satu jam.</p>",
    `<p><a href="${href}">${href}</a></p>`,
    "<p>If you did not ask for this, ignore this email. / Abaikan email ini jika Anda tidak memintanya.</p>",
  ].join("\n");
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
