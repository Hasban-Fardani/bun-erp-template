import type { AppContext } from "../../bootstrap/context.ts";

export const NOTIFICATION_CHANNELS = ["database"] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

/** What a feature asks for; each channel decides how to deliver it. */
export type NotifyInput = {
  recipients: readonly string[];
  /** Stable `domain.event` name, like the audit event contract. */
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /**
   * Stable identity for retryable fan-out: a retried notify with the same key enqueues one mail
   * job. Keep it short (the channel prefixes it and appends the recipient); without one the mail
   * channel falls back to a hash of the notification content.
   */
  idempotencyKey?: string;
  /** Defaults to the database channel only. */
  via?: readonly NotificationChannelName[];
};

/** The subset of the context channels need, so a test can inject a memory mailer. */
export type NotificationChannelContext = Pick<AppContext, "db" | "logger" | "env">;

export type NotificationChannel = {
  readonly name: string;
  send(input: NotifyInput): Promise<void>;
};

export type NotificationChannelFactory = (ctx: NotificationChannelContext) => NotificationChannel;
