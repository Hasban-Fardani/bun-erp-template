import { isAppInstalled } from "../lib/apps.ts";
import { run } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

/** Mobile is a catalog app: every mobile command needs it installed first. */
async function requireMobileApp(): Promise<void> {
  if (await isAppInstalled("mobile")) return;
  process.stderr.write(
    "apps/mobile is not installed. Run `bun loom init` (choose a combination with mobile) or `bun loom apps:create mobile mobile`.\n",
  );
  process.exit(1);
}

export const commands = [
  defineCommand("mobile:dev", async () => {
    await requireMobileApp();
    await run(["bun", "run", "--cwd", "apps/mobile", "dev"], "mobile dev");
  }),
  defineCommand("mobile:preview", async () => {
    await requireMobileApp();
    await run(["bun", "run", "--cwd", "apps/mobile", "preview"], "mobile preview");
  }),
  defineCommand("mobile:build", async () => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile.ts", "build"], "mobile build");
  }),
  defineCommand("mobile:package", async (args) => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile.ts", "package", ...args], "mobile native package");
  }),
  defineCommand("mobile:version", async (args) => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile-version.ts", ...args], "stamp mobile version");
  }),
  defineCommand("mobile:add", async (args) => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile.ts", "add", ...args], "add native project");
  }),
  defineCommand("mobile:sync", async (args) => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile.ts", "sync", ...args], "sync mobile assets");
  }),
  defineCommand("mobile:open", async (args) => {
    await requireMobileApp();
    await run(["bun", "cli/tasks/mobile.ts", "open", ...args], "open native project");
  }),
];
