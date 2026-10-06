import { afterAll, expect, test } from "bun:test";
import { installCatalogApp } from "../../../../cli/lib/app-catalog.ts";

const dataRoot = `${import.meta.dir}/../../../../.data`;
const created: string[] = [];

async function fixtureRoot(): Promise<string> {
  await Bun.$`mkdir -p ${dataRoot}`.quiet();
  const dir = (await Bun.$`mktemp -d ${`${dataRoot}/erp-app-catalog-XXXXXX`}`.text()).trim();
  created.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of created) await Bun.$`rm -rf ${dir}`.quiet();
});

/** Minimal catalog shape: the real files are TypeScript, but the sync only reads and copies them. */
async function seedCatalog(root: string, kind: "web" | "mobile"): Promise<void> {
  const catalog = `${root}/templates/apps/${kind}`;
  await Bun.write(
    `${catalog}/package.json`,
    `${JSON.stringify({ name: `@bun-erp/${kind}`, version: "0.1.0", private: true, devDependencies: { "@bun-erp/server": "workspace:*" } }, null, 2)}\n`,
  );
  await Bun.write(
    `${catalog}/src/lib/rpc.ts`,
    'import type { AppType } from "@bun-erp/server/app-type";\nexport const rpc = undefined as unknown as AppType;\n',
  );
  await Bun.write(
    `${catalog}/src/lib/rpc-detached.ts`,
    "/** Detached stub. Re-fit marker: detached-shell. */\nexport const rpc = {};\n",
  );
  if (kind === "web") {
    await Bun.write(`${catalog}/tests/rpc-types.ts`, "export {};\n");
    await Bun.write(`${catalog}/tests/unit/identity-validation.test.ts`, "export {};\n");
  }
}

test("a web app without a server detaches the RPC contract and re-fits when the server lands", async () => {
  const root = await fixtureRoot();
  await Bun.write(
    `${root}/package.json`,
    `${JSON.stringify({ version: "0.1.0", workspaces: ["packages/ui"] }, null, 2)}\n`,
  );
  await seedCatalog(root, "web");

  const detached = await installCatalogApp(root, { name: "web", kind: "web", hasServer: false });
  expect(detached.created).toBe(true);
  expect(await Bun.file(`${root}/apps/web/src/lib/rpc.ts`).text()).toContain("detached-shell");
  expect(await Bun.file(`${root}/apps/web/src/lib/rpc-detached.ts`).exists()).toBe(false);
  expect(await Bun.file(`${root}/apps/web/tests/rpc-types.ts`).exists()).toBe(false);
  expect(await Bun.file(`${root}/apps/web/tests/unit/identity-validation.test.ts`).exists()).toBe(false);
  const detachedManifest = (await Bun.file(`${root}/apps/web/package.json`).json()) as {
    devDependencies?: Record<string, string>;
  };
  expect(detachedManifest.devDependencies?.["@bun-erp/server"]).toBeUndefined();
  const registered = (await Bun.file(`${root}/package.json`).json()) as { workspaces: string[] };
  expect(registered.workspaces).toContain("apps/web");

  const refit = await installCatalogApp(root, { name: "web", kind: "web", hasServer: true });
  expect(refit.created).toBe(false);
  expect(await Bun.file(`${root}/apps/web/src/lib/rpc.ts`).text()).toContain("@bun-erp/server/app-type");
  expect(await Bun.file(`${root}/apps/web/tests/rpc-types.ts`).exists()).toBe(true);
  expect(await Bun.file(`${root}/apps/web/tests/unit/identity-validation.test.ts`).exists()).toBe(true);
  const refitManifest = (await Bun.file(`${root}/apps/web/package.json`).json()) as {
    devDependencies?: Record<string, string>;
  };
  expect(refitManifest.devDependencies?.["@bun-erp/server"]).toBe("workspace:*");
});

test("mobile detaches its unused RPC client without server-coupled tests", async () => {
  const root = await fixtureRoot();
  await Bun.write(
    `${root}/package.json`,
    `${JSON.stringify({ version: "0.1.0", workspaces: ["packages/ui"] }, null, 2)}\n`,
  );
  await seedCatalog(root, "mobile");

  await installCatalogApp(root, { name: "mobile", kind: "mobile", hasServer: false });
  expect(await Bun.file(`${root}/apps/mobile/src/lib/rpc.ts`).text()).toContain("detached-shell");
  const manifest = (await Bun.file(`${root}/apps/mobile/package.json`).json()) as {
    devDependencies?: Record<string, string>;
  };
  expect(manifest.devDependencies?.["@bun-erp/server"]).toBeUndefined();
});
