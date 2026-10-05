import { DriverRegistry } from "../registry.ts";
import { logMailDriver } from "./drivers/log.ts";
import { memoryMailDriver } from "./drivers/memory.ts";
import { smtpMailDriver } from "./drivers/smtp.ts";
import type { MailDriver, MailDriverContext } from "./types.ts";

/**
 * Drivers are looked up by name so a deployment selects its transport with MAIL_DRIVER,
 * and a project can register its own (HTTP mail API, Resend, …) without touching the core.
 */
export class MailDriverRegistry extends DriverRegistry<MailDriverContext, MailDriver> {
  constructor() {
    super("mail driver");
  }
}

/** Built-in drivers. `memory` is registered here too so tests share the resolver, not a side path. */
export function createMailRegistry(): MailDriverRegistry {
  return new MailDriverRegistry()
    .register("log", logMailDriver)
    .register("memory", memoryMailDriver)
    .register("smtp", smtpMailDriver);
}

export type { MailDriverContext, MailDriverFactory } from "./types.ts";
