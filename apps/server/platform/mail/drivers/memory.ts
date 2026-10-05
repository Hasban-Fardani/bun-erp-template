import { createUuid } from "@bun-erp/utils";
import type { MailDriver, MailDriverFactory, MailSendResult, ResolvedMail } from "../types.ts";

/** A driver that keeps sent messages in memory: the seam tests assert against. */
export function createMemoryMailDriver(): MailDriver & { readonly sent: ResolvedMail[] } {
  const sent: ResolvedMail[] = [];
  return {
    name: "memory",
    sent,
    async send(message): Promise<MailSendResult> {
      sent.push(message);
      return { driver: "memory", messageId: createUuid() };
    },
  };
}

export const memoryMailDriver: MailDriverFactory = () => createMemoryMailDriver();
