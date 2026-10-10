import { escapeHtml } from "@loom/mail/server";
import { inArray } from "drizzle-orm";
import { users } from "../identity/index.ts";
import type { NotificationChannelFactory, NotifyInput } from "../notifications/index.ts";
import { createMailEnqueue } from "./wiring.ts";

/**
 * Emails every recipient through the configured mailer; delivery goes through the queue. The
 * enqueue uses the channel context's database, so a `notify()` called with the feature transaction
 * stores the `mail.send` job in that transaction instead of the root connection.
 */
export const mailChannel: NotificationChannelFactory = ({ db }) => ({
  name: "mail",
  async send(input) {
    if (input.recipients.length === 0) return;
    const recipients = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, [...input.recipients]));
    const body = input.body ?? input.title;
    const enqueue = createMailEnqueue(db);
    for (const recipient of recipients) {
      await enqueue({
        name: "mail.send",
        payload: {
          to: recipient.email,
          subject: input.title,
          text: body,
          html: `<p>${escapeHtml(body)}</p>`,
        },
        idempotencyKey: await idempotencyKey(input, recipient.id),
      });
    }
  },
});

/**
 * A stable key so a retried fan-out does not enqueue the same mail twice. Callers with a natural
 * identity (a batch id) pass `idempotencyKey`; otherwise the notification content is hashed.
 */
async function idempotencyKey(input: NotifyInput, recipientId: string): Promise<string> {
  const stable =
    input.idempotencyKey ??
    (await contentFingerprint({
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      data: input.data ?? null,
    }));
  return `notification:${stable}:${recipientId}`;
}

async function contentFingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
