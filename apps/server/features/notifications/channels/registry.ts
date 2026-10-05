import { DriverRegistry } from "@bun-erp/utils";
import type { NotificationChannel, NotificationChannelContext } from "../types.ts";
import { databaseChannel } from "./database.ts";
import { mailChannel } from "./mail.ts";

/**
 * Channels are resolved by name so a project can register a webhook, SMS, or push channel
 * without editing the core. The built-ins are database (in-app inbox) and mail.
 */
export class NotificationChannelRegistry extends DriverRegistry<NotificationChannelContext, NotificationChannel> {
  constructor() {
    super("notification channel");
  }
}

export function createNotificationRegistry(): NotificationChannelRegistry {
  return new NotificationChannelRegistry().register("database", databaseChannel).register("mail", mailChannel);
}
