import { notifications } from "../schema.ts";
import type { NotificationChannelFactory } from "../types.ts";

/** Persists one row per recipient. This is the default channel: an in-app inbox entry. */
export const databaseChannel: NotificationChannelFactory = ({ db }) => ({
  name: "database",
  async send(input) {
    if (input.recipients.length === 0) return;
    await db.insert(notifications).values(
      input.recipients.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? "",
        data: input.data ?? null,
      })),
    );
  },
});
