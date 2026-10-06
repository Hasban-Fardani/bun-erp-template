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
