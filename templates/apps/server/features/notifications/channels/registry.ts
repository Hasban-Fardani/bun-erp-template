import { DriverRegistry } from "@bun-erp/utils";
import type { NotificationChannel, NotificationChannelContext } from "../types.ts";
// @erp:mail
import { databaseChannel } from "./database.ts";

/**
 * Channels are resolved by name so a project can register a webhook, SMS, or push channel
 * without editing the core. The default built-in is database (in-app inbox); the opt-in mail
 * feature registers its own channel through `bun erp features:install mail`.
 */
export class NotificationChannelRegistry extends DriverRegistry<NotificationChannelContext, NotificationChannel> {
  constructor() {
    super("notification channel");
  }
}

export function createNotificationRegistry(): NotificationChannelRegistry {
  return new NotificationChannelRegistry().register("database", databaseChannel);
}
