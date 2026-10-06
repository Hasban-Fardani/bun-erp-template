import { resolve } from "node:path";
import { installCatalogApp } from "../lib/app-catalog.ts";
import { envKeyCount, isAppInstalled, showApps } from "../lib/apps.ts";
import { formatTimestamp } from "../lib/format.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { repoRoot } from "../lib/repo.ts";
import { formatScaffold, writeScaffold } from "../lib/scaffold.ts";
import { toKebabName } from "../lib/scaffolding.ts";
import { readWorkspaceApp, registerWorkspace, renderAppScaffold } from "../lib/workspace-apps.ts";
import { defineCommand } from "../registry.ts";

/** App kinds: server scaffolds inline; web/mobile copy their catalog under templates/apps/. */
const APP_TYPES: readonly string[] = ["server", "web", "mobile"];

export const commands = [
  defineCommand("apps", async () => {
    await showApps();
  }),
  defineCommand("apps:list", async () => {
    await showApps();
  }),
  defineCommand("apps:status", async (args) => {
    const parsed = parseCommandOptions(args, {});
    const name = resolveRequired(parsed.positional[0], "App name");
    if (!name) {
      process.stderr.write("Usage: bun erp apps:status <name>\n");
      process.exit(1);
    }
    const app = await readWorkspaceApp(repoRoot, name);
    if (!app) throw new Error(`Unknown app "${name}". Run bun erp apps to list workspace apps.`);
    process.stdout.write(`app:        ${app.name}\n`);
    process.stdout.write(`path:       ${app.dir}\n`);
    process.stdout.write(`package:    ${app.packageName}\n`);
    process.stdout.write(`version:    ${app.version}\n`);
    process.stdout.write(`private:    ${app.private ? "yes" : "no"}\n`);
    process.stdout.write(`entry:      ${app.entry ?? "—"}\n`);
    process.stdout.write(`dev port:   ${app.port ? `${app.port} (${app.portSource})` : "—"}\n`);
    process.stdout.write(
      app.buildDir
        ? `build:      ${app.dir}/${app.buildDir} (updated ${formatTimestamp(app.buildUpdatedAt)})\n`
        : "build:      not built\n",
    );
    process.stdout.write(
      app.testDir ? `tests:      ${app.dir}/${app.testDir} (${app.testFiles} file(s))\n` : "tests:      none\n",
    );
    process.stdout.write(`scripts:    ${Object.keys(app.scripts).join(", ") || "—"}\n`);
    const appEnv = await envKeyCount(resolve(repoRoot, app.dir, ".env.example"));
    const rootEnv = appEnv === undefined ? await envKeyCount(resolve(repoRoot, ".env.example")) : undefined;
    const envLabel =
      appEnv !== undefined
        ? `${app.dir}/.env.example (${appEnv} key(s))`
        : rootEnv !== undefined
          ? `.env.example (${rootEnv} key(s))`
          : "no .env.example";
    process.stdout.write(`env:        ${envLabel}\n`);
  }),
  defineCommand("apps:create", async (args) => {
    const rawName = resolveRequired(args[0], "App name");
    const jenis = resolveRequired(args[1], "App type (server|web|mobile)");
    if (!rawName || !jenis) {
      process.stderr.write("Usage: bun erp apps:create <name> <server|web|mobile>\n");
      process.exit(1);
    }
    if (!APP_TYPES.includes(jenis)) {
      throw new Error(`Unknown app type "${jenis}". Use one of: ${APP_TYPES.join(", ")}.`);
    }
    const name = toKebabName(rawName, "App");
    const dir = `apps/${name}`;
    const destination = resolve(repoRoot, dir);
    if (await Bun.file(resolve(destination, "package.json")).exists()) {
      throw new Error(`App already exists: ${dir}`);
    }
    const rootManifest = (await Bun.file(resolve(repoRoot, "package.json")).json()) as { version?: string };
    const version = rootManifest.version ?? "0.1.0";

    if (jenis === "server") {
      const scaffold = renderAppScaffold(rawName, { version });
      for (const file of scaffold.files) await writeScaffold(resolve(repoRoot, file.path), file.contents);
      await formatScaffold(scaffold.files.map((file) => file.path));
      const manifestPath = resolve(repoRoot, "package.json");
      const registered = registerWorkspace(await Bun.file(manifestPath).text(), dir);
      if (registered.status === "added") await Bun.write(manifestPath, registered.source);
      process.stdout.write(`Created ${jenis} app: ${dir}\n`);
      process.stdout.write(
        registered.status === "added"
          ? `Registered workspace: ${dir}\n`
          : `Add "${dir}" to the workspaces array in package.json\n`,
      );
    } else {
      // web/mobile copy their catalog through the same helper `bun erp init` uses.
      await installCatalogApp(repoRoot, {
        name,
        kind: jenis as "web" | "mobile",
        hasServer: await isAppInstalled("server"),
      });
      process.stdout.write(`Created ${jenis} app: ${dir} from templates/apps/${jenis}\n`);
      process.stdout.write(`Registered workspace: ${dir}\n`);
    }
    process.stdout.write(`Next: run bun install, then bun run --cwd ${dir} dev\n`);
  }),
];
