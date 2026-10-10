import { parseCommandOptions } from "@cli/lib/options.ts";
import { defineCommand } from "@cli/registry.ts";
import { loadEnv } from "../../config/index.ts";
import { type MailProbe, runMailTest } from "../lib/mail-test.ts";

/** A variable specifier keeps the CLI core compiling in an app where the mail package is not installed. */
const MAIL_PACKAGE: string = "@loom/mail/server";

/** The slice of `@loom/mail/server` this command uses; typed locally so tsc never needs the package. */
type MailModule = {
  createMailer(options: { config: ReturnType<typeof loadEnv>; logger: { info(): void } }): MailProbe;
};

async function openMailer(): Promise<MailProbe> {
  let mail: MailModule;
  try {
    mail = (await import(MAIL_PACKAGE)) as MailModule;
  } catch {
    throw new Error("The mail package is not installed. Run `bun loom features:install mail` first.");
  }
  return mail.createMailer({ config: loadEnv(), logger: { info: () => {} } });
}

export const commands = [
  defineCommand("mail:test", async (args) => {
    const to = parseCommandOptions(args, { values: ["to"] }).values.get("to");
    if (to === undefined) {
      process.stderr.write("Usage: bun loom mail:test --to <address>\n");
      process.exit(2);
    }

    let mailer: MailProbe;
    try {
      mailer = await openMailer();
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }

    const result = await runMailTest(mailer, to);
    if (!result.ok) {
      process.stderr.write(`Mail test failed (driver ${result.driver}): ${result.error}\n`);
      process.exit(1);
    }
    process.stdout.write(`Driver: ${result.driver}\nMessage ID: ${result.messageId}\nSent to: ${to}\n`);
  }),
];
