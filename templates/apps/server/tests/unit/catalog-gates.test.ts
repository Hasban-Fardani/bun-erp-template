import { expect, test } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "@cli/lib/repo.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("copy gate scans the web catalog copy", async () => {
  const { checkUserCopy } = await import("@cli/gates/copy-guard.ts");
  await withTempRoot(
    {
      "templates/apps/web/src/example.tsx":
        'export const Example = () => <button label="Deploy the backend">x</button>;',
    },
    async (root) => {
      const findings = await checkUserCopy(root);
      expect(findings.some((finding) => finding.file === "templates/apps/web/src/example.tsx")).toBe(true);
    },
  );
});

test("motion gate scans the package catalog copy", async () => {
  const { checkMotion } = await import("@cli/gates/motion-gate.ts");
  await withTempRoot(
    {
      "templates/packages/charts/src/loop.tsx": 'export const Loop = () => <div className="animate-spin" />;',
    },
    async (root) => {
      const findings = await checkMotion(root);
      expect(findings.some((finding) => finding.file === "templates/packages/charts/src/loop.tsx")).toBe(true);
    },
  );
});

test("ui-completeness scans the catalog page copy", async () => {
  const { checkUiCompleteness } = await import("@cli/gates/ui-completeness.ts");
  await withTempRoot(
    {
      "templates/apps/web/src/pages/dashboard.tsx":
        "export const Dashboard = ({ rows }: { rows: unknown }) => <ResourceTable result={rows} />;",
    },
    async (root) => {
      const findings = await checkUiCompleteness(root);
      expect(
        findings.some(
          (finding) =>
            finding.file === "templates/apps/web/src/pages/dashboard.tsx" && finding.rule === "UI_STATE_MISSING",
        ),
      ).toBe(true);
    },
  );
});

test("contrast gate scans the catalog component copy", async () => {
  const { checkContrast } = await import("@cli/gates/contrast-gate.ts");
  const stylesheet = await Bun.file(join(repoRoot, "packages/ui/src/styles.css")).text();
  await withTempRoot(
    {
      "packages/ui/src/styles.css": stylesheet,
      "templates/apps/web/src/bad.tsx":
        'export const Bad = () => <a className="bg-accent-soft text-accent-ink">Roles</a>;',
    },
    async (root) => {
      const findings = await checkContrast(root);
      expect(findings.some((finding) => finding.includes("templates/apps/web/src/bad.tsx"))).toBe(true);
    },
  );
});

test("design gate requires a spec for every catalog screen", async () => {
  const { checkDesign } = await import("@cli/gates/design-gate.ts");
  await withTempRoot(
    {
      "templates/apps/web/src/pages/_authenticated/index.tsx": "export const Route = {};",
    },
    async (root) => {
      const findings = await checkDesign(root);
      expect(findings.some((finding) => finding.code === "SCREEN_WITHOUT_SPEC" && finding.screen === "overview")).toBe(
        true,
      );
    },
  );
});

test("design gate reports a malformed spec instead of throwing a raw stack", async () => {
  const { checkDesign } = await import("@cli/gates/design-gate.ts");
  await withTempRoot(
    {
      "apps/web/src/pages/login.tsx": "export const Route = {};",
      "apps/web/design/login.json": "{ this is not json",
    },
    async (root) => {
      const findings = await checkDesign(root);
      expect(findings.some((finding) => finding.code === "SPEC_UNREADABLE" && finding.screen === "login")).toBe(true);
    },
  );
});

test("design gate reports a screen-name collision instead of silently merging screens", async () => {
  const { checkDesign } = await import("@cli/gates/design-gate.ts");
  await withTempRoot(
    {
      "apps/web/src/pages/foo.tsx": "export const Route = {};",
      "apps/web/src/pages/foo/index.tsx": "export const Route = {};",
    },
    async (root) => {
      const findings = await checkDesign(root);
      expect(findings.some((finding) => finding.code === "SCREEN_NAME_COLLISION" && finding.screen === "foo")).toBe(
        true,
      );
    },
  );
});

test("nested index pages no longer collapse into one overview screen", async () => {
  const { checkDesign } = await import("@cli/gates/design-gate.ts");
  await withTempRoot(
    {
      "apps/web/src/pages/reports/index.tsx": "export const Route = {};",
      "apps/web/src/pages/settings/index.tsx": "export const Route = {};",
    },
    async (root) => {
      const findings = await checkDesign(root);
      expect([...new Set(findings.map((finding) => finding.screen))].sort()).toEqual(["reports", "settings"]);
    },
  );
});

test("contrast gate reports a missing stylesheet instead of throwing", async () => {
  const { checkContrast } = await import("@cli/gates/contrast-gate.ts");
  await withTempRoot({}, async (root) => {
    const findings = await checkContrast(root);
    expect(findings.some((finding) => finding.includes("styles.css"))).toBe(true);
  });
});
