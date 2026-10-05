import { afterAll, expect, test } from "bun:test";
import { listWorkspaceApps, readWorkspaceApp, registerWorkspace, renderAppScaffold } from "../../../../tools/apps.ts";

const dataRoot = `${import.meta.dir}/../../../../.data`;
const created: string[] = [];

async function fixtureRoot(): Promise<string> {
  await Bun.$`mkdir -p ${dataRoot}`.quiet();
  const dir = (await Bun.$`mktemp -d ${`${dataRoot}/erp-apps-XXXXXX`}`.text()).trim();
  created.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of created) await Bun.$`rm -rf ${dir}`.quiet();
});

test("workspace apps are discovered from the root manifest and report status", async () => {
  const root = await fixtureRoot();
  await Bun.write(
    `${root}/package.json`,
    JSON.stringify({ version: "0.1.0", workspaces: ["apps/alpha", "packages/lib"] }),
  );
  await Bun.write(
    `${root}/apps/alpha/package.json`,
    JSON.stringify({
      name: "@bun-erp/alpha",
      version: "0.1.0",
      private: true,
      scripts: { dev: "vite", build: "vite build" },
    }),
  );
  await Bun.write(`${root}/apps/alpha/vite.config.ts`, "export default { server: { port: 5173 } };\n");
  await Bun.write(`${root}/apps/alpha/src/main.tsx`, "export {};\n");
  await Bun.write(`${root}/apps/alpha/tests/alpha.test.ts`, 'import { test } from "bun:test";\ntest("x", () => {});\n');
  await Bun.write(`${root}/apps/alpha/dist/index.html`, "<html></html>");

  const apps = await listWorkspaceApps(root);
  expect(apps.map((app) => app.name)).toEqual(["alpha"]);

  const alpha = await readWorkspaceApp(root, "alpha");
  expect(alpha?.packageName).toBe("@bun-erp/alpha");
  expect(alpha?.version).toBe("0.1.0");
  expect(alpha?.entry).toBe("src/main.tsx");
  expect(alpha?.port).toBe(5173);
  expect(alpha?.portSource).toBe("config");
  expect(alpha?.buildDir).toBe("dist");
  expect(alpha?.testDir).toBe("tests");
  expect(alpha?.testFiles).toBe(1);
  expect(await readWorkspaceApp(root, "missing")).toBeUndefined();
});

test("apps:create scaffold is runnable, version-aligned, and testable", () => {
  const scaffold = renderAppScaffold("Night Shift", { version: "0.1.0", port: 4100 });
  expect(scaffold.dir).toBe("apps/night-shift");
  expect(scaffold.packageName).toBe("@bun-erp/night-shift");

  const manifest = scaffold.files.find((file) => file.path.endsWith("package.json"))?.contents ?? "";
  expect(JSON.parse(manifest)).toMatchObject({ name: "@bun-erp/night-shift", version: "0.1.0" });
  expect(scaffold.files.some((file) => file.path.endsWith("tests/night-shift.test.ts"))).toBe(true);

  const index = scaffold.files.find((file) => file.path.endsWith("src/index.ts"))?.contents ?? "";
  expect(index).toContain("DEFAULT_PORT = 4100");
  expect(index).toContain("Bun.serve");
});

test("registerWorkspace appends to the apps entries once", () => {
  const source = `{
  "workspaces": [
    "apps/server",
    "apps/web",
    "packages/ui"
  ]
}
`;
  const added = registerWorkspace(source, "apps/worker");
  expect(added.status).toBe("added");
  expect(added.source).toContain('    "apps/web",\n    "apps/worker",');
  expect(registerWorkspace(added.source, "apps/worker").status).toBe("present");

  const withoutApps = `{
  "workspaces": [
    "packages/ui"
  ]
}
`;
  expect(registerWorkspace(withoutApps, "apps/worker").status).toBe("skipped");
});
