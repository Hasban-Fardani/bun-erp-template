import { expect, test } from "bun:test";
import { checkWorkspaceVersions } from "@cli/gates/versioning.ts";
import { withTempRoot } from "./support/temp-root.ts";

const manifest = (workspaces: string[]) => JSON.stringify({ name: "root", version: "0.1.0", workspaces });

test("a workspace entry with no package.json on disk fails the versioning gate", async () => {
  await withTempRoot(
    {
      "package.json": manifest(["apps/server", "packages/ui"]),
      "packages/ui/package.json": '{"name":"ui","version":"0.1.0"}',
    },
    async (root) => {
      const findings = await checkWorkspaceVersions(root);
      expect(findings.map((finding) => finding.packageName)).toEqual(["apps/server"]);
      expect(findings[0]?.detail).toContain("bun install");
    },
    "workspaces-missing-",
  );
});

test("workspaces that all exist with the root version are clean", async () => {
  await withTempRoot(
    { "package.json": manifest(["packages/ui"]), "packages/ui/package.json": '{"name":"ui","version":"0.1.0"}' },
    async (root) => {
      expect(await checkWorkspaceVersions(root)).toEqual([]);
    },
    "workspaces-ok-",
  );
});
