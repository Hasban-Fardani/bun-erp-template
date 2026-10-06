import { escapeHtml } from "@bun-erp/mail/server";
import { inArray } from "drizzle-orm";
import { users } from "../identity/schema.ts";
import type { NotificationChannelFactory } from "../notifications/types.ts";

/** Emails every recipient through the configured mailer; delivery goes through the queue. */
export const mailChannel: NotificationChannelFactory = ({ db, mail }) => ({
  name: "mail",
  async send(input) {
    if (input.recipients.length === 0) return;
    const recipients = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, [...input.recipients]));
    const body = input.body ?? input.title;
    for (const recipient of recipients) {
      await mail.queue({
        to: recipient.email,
        subject: input.title,
        text: body,
        html: `<p>${escapeHtml(body)}</p>`,
      });
    }
  },
});
