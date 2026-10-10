/** The slice of a `Mailer` the probe needs; structural so the CLI core never imports the mail package. */
export type MailProbe = {
  readonly driver: string;
  verify(): Promise<void>;
  send(message: { to: string; subject: string; text: string }): Promise<{ driver: string; messageId: string }>;
};

export type MailTestResult =
  | { ok: true; driver: string; messageId: string }
  | { ok: false; driver: string; error: string };

/**
 * Sends one plain message synchronously through the configured driver (never the queue), after the
 * driver's own connectivity check when it has one. Errors are returned, not thrown, so the command
 * decides the exit code and the same function is testable without a process.
 */
export async function runMailTest(mailer: MailProbe, to: string, now: Date = new Date()): Promise<MailTestResult> {
  try {
    await mailer.verify();
    const result = await mailer.send({
      to,
      subject: `Mail transport test (${mailer.driver})`,
      text: `This message was sent by "bun loom mail:test" through the ${mailer.driver} driver at ${now.toISOString()}.`,
    });
    return { ok: true, driver: result.driver, messageId: result.messageId };
  } catch (error) {
    return { ok: false, driver: mailer.driver, error: error instanceof Error ? error.message : String(error) };
  }
}
