/**
 * Template-development helper (not a user command).
 *
 * The app catalogs under `templates/apps/` are the source of truth; `apps/*` is generated.
 * `bun loom init` and `bun loom apps:create` keep an existing app, so after editing a catalog
 * this refreshes the installed copy:
 *
 *   bun cli/tasks/sync-apps.ts
 */
import { resolve } from "node:path";
import { type CatalogAppKind, installCatalogApp } from "../lib/app-catalog.ts";

const APPS: readonly { name: string; kind: CatalogAppKind }[] = [
  { name: "server", kind: "server" },
  { name: "web", kind: "web" },
  { name: "mobile", kind: "mobile" },
];

const root = resolve(import.meta.dir, "../..");
const installed = [];

for (const app of APPS) {
  const dir = resolve(root, "apps", app.name);
  if (await Bun.file(resolve(dir, "package.json")).exists()) installed.push(app);
}

for (const app of installed) {
  await Bun.$`rm -rf ${resolve(root, "apps", app.name)}`.quiet();
}

for (const app of installed) {
  await installCatalogApp(root, { ...app, hasServer: true });
  console.log(`synced apps/${app.name} from templates/apps/${app.kind}`);
}

if (installed.length === 0) console.log("No installed apps to sync; run `bun loom init --apps server,web --yes`.");
