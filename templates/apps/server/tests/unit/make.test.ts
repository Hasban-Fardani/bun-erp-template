import { expect, test } from "bun:test";
import { planMakeFeature } from "@cli/lib/make-feature.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { renderFeatureScaffold } from "@cli/lib/scaffolding.ts";
import { renderTemplate } from "@cli/lib/template.ts";
import { CORE_FILES, withCoreFiles } from "./support/make-feature-fixture.ts";

/**
 * Command-level contract for `bun loom make:feature`: the plan validates every explicit wiring
 * marker before the first write, so a marker-less core file aborts the command with zero files
 * written. `bun cli/index.ts` turns that rejection into a non-zero exit.
 */
const ROUTES = CORE_FILES["apps/server/routes/api.ts"] ?? "";
/** The route file without `// @loom:routes`: the installer must refuse, not fall back to guessing. */
const ROUTES_WITHOUT_MARKER = ROUTES.replace("  // @loom:routes\n", "");

/** Every file under `root` with its contents, so a refused plan can prove it wrote nothing. */
async function snapshotTree(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
    snapshot[file] = await Bun.file(`${root}/${file}`).text();
  }
  return snapshot;
}

test("make:feature exits without writing when the route marker is missing", async () => {
  await withCoreFiles({ "apps/server/routes/api.ts": ROUTES_WITHOUT_MARKER }, async (root) => {
    const before = await snapshotTree(root);
    await expect(planMakeFeature(root, "invoices")).rejects.toThrow(/@loom:routes/);
    // Zero files: the tree is byte-identical after the refusal.
    expect(await snapshotTree(root)).toEqual(before);
  });
});

test("make:feature writes nothing when any marker is missing", async () => {
  await withCoreFiles(
    { "apps/server/features/rbac/statements.ts": 'export const statements = {\n  audit: ["read"],\n} as const;' },
    async (root) => {
      const before = await snapshotTree(root);
      await expect(planMakeFeature(root, "invoices")).rejects.toThrow(/@loom:permissions/);
      expect(await snapshotTree(root)).toEqual(before);
    },
  );
});

test("template substitution renders values literally, including $&", () => {
  // A replacement string would expand `$&` to the matched placeholder; the renderer must not.
  expect(renderTemplate("name={{name}} and {{name}}", { name: "a$&b" })).toBe("name=a$&b and a$&b");
  // A typo in a template is a generator bug, not an empty value.
  expect(() => renderTemplate("{{missing}}", {})).toThrow(/missing/);
});

test("a $& in a sequence option renders literally into the generated service", () => {
  const scaffold = renderFeatureScaffold("invoices", { sequence: { key: "a$&b", prefix: "$&" } });
  const service = scaffold.files.find((file) => file.path.endsWith("service.ts"))?.contents ?? "";
  expect(service).toContain('nextNumber(tx, "a$&b"');
  expect(service).toContain('prefix: "$&"');
});

test("generated server imports other features only through their index.ts", () => {
  const scaffold = renderFeatureScaffold("invoices", { softDelete: true });
  const bypasses: string[] = [];
  for (const file of scaffold.files) {
    // A single `../<feature>/...` is a cross-feature import; `../../...` is database/http/bootstrap.
    for (const match of file.contents.matchAll(/from\s+"\.\.\/([a-z0-9-]+)\/([^"]+)"/g)) {
      const [, feature, rest] = match;
      if (feature === scaffold.name || rest === "index.ts") continue;
      bypasses.push(`${file.path} imports ../${feature}/${rest}`);
    }
  }
  expect(bypasses).toEqual([]);
  // The feature itself ships a public surface for later features.
  expect(scaffold.files.some((file) => file.path === `apps/server/features/${scaffold.name}/index.ts`)).toBe(true);
});

test("feature public surfaces export what the generator imports", async () => {
  const rbac = await Bun.file(`${repoRoot}/apps/server/features/rbac/index.ts`).text();
  const audit = await Bun.file(`${repoRoot}/apps/server/features/audit/index.ts`).text();
  expect(rbac).toContain("PermissionKey");
  expect(audit).toContain("auditChange");
  expect(audit).toContain("snapshot");
});

test("a full plan still applies every file and wiring edit", async () => {
  await withCoreFiles(
    {},
    async (root) => {
      const plan = await planMakeFeature(root, "invoices");
      expect(plan.wiring.every((edit) => edit.status === "added")).toBe(true);
      expect(plan.scaffold.files.some((file) => file.path.endsWith("service.ts"))).toBe(true);
    },
    "make-command-",
  );
});
