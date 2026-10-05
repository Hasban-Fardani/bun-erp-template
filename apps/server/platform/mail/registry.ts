import { logMailDriver } from "./drivers/log.ts";
import { memoryMailDriver } from "./drivers/memory.ts";
import { smtpMailDriver } from "./drivers/smtp.ts";
import type { MailDriver, MailDriverContext, MailDriverFactory } from "./types.ts";

/**
 * Drivers are looked up by name so a deployment selects its transport with MAIL_DRIVER,
 * and a project can register its own (HTTP mail API, Resend, …) without touching the core.
 */
export class MailDriverRegistry {
  readonly #factories = new Map<string, MailDriverFactory>();

  register(name: string, factory: MailDriverFactory): this {
    const key = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key)) throw new Error(`Invalid mail driver name: ${name}`);
    this.#factories.set(key, factory);
    return this;
  }

  has(name: string): boolean {
    return this.#factories.has(name.trim().toLowerCase());
  }

  names(): string[] {
    return [...this.#factories.keys()].sort();
  }

  create(name: string, context: MailDriverContext): MailDriver {
    const key = name.trim().toLowerCase();
    const factory = this.#factories.get(key);
    if (!factory) {
      throw new Error(`Unknown mail driver "${name}". Registered: ${this.names().join(", ") || "(none)"}`);
    }
    return factory(context);
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
