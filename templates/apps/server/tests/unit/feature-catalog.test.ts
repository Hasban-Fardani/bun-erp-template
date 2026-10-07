import { expect, test } from "bun:test";
import {
  catalogFeatureNames,
  migrationBaseName,
  planFeatureInstall,
  readFeatureManifest,
} from "@cli/lib/feature-catalog.ts";
import { planInfraWiring } from "@cli/lib/infra-wiring.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { addAuditEntity, addI18nKeys, addNavItem, nextMigrationFile } from "@cli/lib/scaffolding.ts";

test("catalog discovery lists the departments feature", async () => {
  expect(await catalogFeatureNames(repoRoot)).toContain("departments");
});

test("the departments manifest is valid and plans the install destinations", async () => {
  const manifest = await readFeatureManifest(repoRoot, "departments");
  if (manifest.kind !== "server") throw new Error("departments must stay a server feature");
  expect(manifest.name).toBe("departments");
  expect(manifest.permissionResource).toBe("department");
  expect(manifest.auditEntity).toBe("department");
  expect(manifest.nav).toEqual({
    titleKey: "navigation.departments",
    url: "/departments",
    icon: "Building2",
    permission: "department.read",
  });
  expect(manifest.i18nKeys["en-US"]["departments.title"]).toBe("Departments");
  expect(manifest.i18nKeys["id-ID"]["departments.title"]).toBe("Departemen");
  expect(manifest.migrations).toEqual(["migrations/0002_departments.ts"]);

  const plan = planFeatureInstall(manifest);
  const destinations = plan.map((entry) => entry.destination).sort();
  expect(destinations).toContain("apps/server/features/departments/feature.ts");
  expect(destinations).toContain("apps/web/src/features/departments/screens/departments.tsx");
  expect(destinations).toContain("apps/server/tests/features/departments/departments.test.ts");
  expect(destinations).toContain("apps/web/src/pages/_authenticated/departments.tsx");
  expect(destinations).toContain("apps/web/design/departments.json");

  for (const entry of plan) {
    const base = entry.source.startsWith("_shared/")
      ? `${repoRoot}/templates/features`
      : `${repoRoot}/templates/features/departments`;
    expect(await Bun.file(`${base}/${entry.source}`).exists()).toBe(true);
  }
});

test("a catalog migration number is an origin marker, not the app ledger number", () => {
  expect(migrationBaseName("migrations/0002_departments.ts")).toBe("departments");
  const next = nextMigrationFile(
    ["0001_bootstrap.ts", "0002_auth.ts"],
    migrationBaseName("migrations/0002_departments.ts"),
  );
  expect(next).toBe("0003_departments.ts");
});

test("manifest validation rejects traversal, missing files, and name drift", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-feature-${crypto.randomUUID()}`;
  const catalog = `${root}/templates/features/ghost`;
  const valid = {
    name: "ghost",
    permissionResource: "ghost",
    auditEntity: "ghost",
    nav: { titleKey: "navigation.ghost", url: "/ghost", icon: "FileText", permission: "ghost.read" },
    i18nKeys: { "en-US": { "ghost.title": "Ghost" }, "id-ID": { "ghost.title": "Hantu" } },
    files: {
      server: ["server/feature.ts"],
      web: ["web/screens/ghost.tsx"],
      tests: ["tests/ghost.test.ts"],
      page: "web/pages/ghost.tsx",
    },
  };
  try {
    await Bun.write(`${catalog}/feature.json`, JSON.stringify(valid));
    for (const path of ["server/feature.ts", "web/screens/ghost.tsx", "tests/ghost.test.ts", "web/pages/ghost.tsx"]) {
      await Bun.write(`${catalog}/${path}`, "");
    }
    expect((await readFeatureManifest(root, "ghost")).name).toBe("ghost");

    const traversal = { ...valid, files: { ...valid.files, server: ["server/../feature.ts"] } };
    await Bun.write(`${catalog}/feature.json`, JSON.stringify(traversal));
    await expect(readFeatureManifest(root, "ghost")).rejects.toThrow(/escapes the catalog/);

    const missing = { ...valid, files: { ...valid.files, server: ["server/feature.ts", "server/missing.ts"] } };
    await Bun.write(`${catalog}/feature.json`, JSON.stringify(missing));
    await expect(readFeatureManifest(root, "ghost")).rejects.toThrow(/missing file/);

    const drift = { ...valid, name: "other" };
    await Bun.write(`${catalog}/feature.json`, JSON.stringify(drift));
    await expect(readFeatureManifest(root, "ghost")).rejects.toThrow(/name must match/);
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("wiring helpers honor the manifest instead of regenerating defaults", () => {
  const nav = [
    'import { Bell, type LucideIcon, Users } from "lucide-react";',
    "export const navGroups = [",
    "  {",
    "    items: [",
    "      // @erp:nav",
    "    ],",
    "  },",
    "];",
  ].join("\n");
  const wiredNav = addNavItem(
    nav,
    { name: "departments" },
    {
      titleKey: "navigation.departments",
      url: "/departments",
      icon: "Building2",
      permission: "department.read",
    },
  );
  expect(wiredNav.status).toBe("added");
  expect(wiredNav.source).toContain("Building2,");
  expect(wiredNav.source).toContain(
    '{ titleKey: "navigation.departments", url: "/departments", icon: Building2, permission: "department.read" }',
  );

  const audit = [
    "export const AUDIT_FIELDS = {",
    '  user: ["id"],',
    "  // @erp:audit",
    "} as const satisfies Record<string, readonly string[]>;",
  ].join("\n");
  const wiredAudit = addAuditEntity(audit, "department", ["id", "name", "code", "isActive"]);
  expect(wiredAudit.source).toContain('"department": ["id", "name", "code", "isActive"],');

  const en = 'export const enUS = {\n  "a": "A",\n} as const;';
  const wiredEn = addI18nKeys(en, { name: "departments" }, "en-US", {
    "navigation.departments": "Departments",
    "departments.title": "Departments",
  });
  expect(wiredEn.source).toContain('"departments.title": "Departments"');
  expect(wiredEn.source).not.toContain("departments.caption");
});

test("i18n wiring only adds keys the catalog does not already hold", () => {
  const en = 'export const enUS = {\n  "common.add": "Add",\n  "a": "A",\n} as const;';
  const merged = addI18nKeys(en, { name: "users" }, "en-US", {
    "common.add": "Add",
    "users.title": "Users",
  });
  expect(merged.status).toBe("added");
  expect(merged.source.match(/"common\.add":/g)).toHaveLength(1);
  expect(merged.source).toContain('"users.title": "Users"');

  const repeated = addI18nKeys(merged.source, { name: "roles" }, "en-US", { "users.title": "Users" });
  expect(repeated.status).toBe("present");
});

const webManifest = {
  name: "reports",
  kind: "web",
  requires: ["data-table"],
  nav: { titleKey: "navigation.reports", url: "/reports", icon: "FileText", permission: "report.read" },
  i18nKeys: { "en-US": { "reports.title": "Reports" }, "id-ID": { "reports.title": "Laporan" } },
  files: {
    web: ["web/screens/reports.tsx"],
    shared: ["_shared/web/use-table-state.ts"],
    page: "web/pages/reports.tsx",
    design: "web/design/reports.json",
  },
};

async function writeWebFixture(root: string, manifest: unknown): Promise<void> {
  const catalog = `${root}/templates/features/reports`;
  await Bun.write(`${catalog}/feature.json`, JSON.stringify(manifest));
  for (const path of ["web/screens/reports.tsx", "web/pages/reports.tsx", "web/design/reports.json"]) {
    await Bun.write(`${catalog}/${path}`, "");
  }
  await Bun.write(`${root}/templates/features/_shared/web/use-table-state.ts`, "");
}

test("a web-kind manifest validates without server, permission, or audit wiring", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-feature-${crypto.randomUUID()}`;
  try {
    await writeWebFixture(root, webManifest);
    const manifest = await readFeatureManifest(root, "reports");
    expect(manifest.kind).toBe("web");
    expect(manifest.requires).toEqual(["data-table"]);

    const plan = planFeatureInstall(manifest);
    const destinations = new Set(plan.map((entry) => entry.destination));
    for (const expected of [
      "apps/web/src/features/reports/screens/reports.tsx",
      "apps/web/src/pages/_authenticated/reports.tsx",
      "apps/web/design/reports.json",
      "apps/web/src/lib/use-table-state.ts",
    ]) {
      expect(destinations.has(expected)).toBe(true);
    }
    expect([...destinations].some((destination) => destination.startsWith("apps/server/"))).toBe(false);
    const shared = plan.find((entry) => entry.destination === "apps/web/src/lib/use-table-state.ts");
    expect(shared?.skipIfPresent).toBe(true);
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

const infraManifest = {
  name: "probe",
  kind: "infra",
  requires: ["mail"],
  wiring: ["context"],
  files: { server: ["server/wiring.ts"], tests: ["tests/probe.test.ts"] },
};

async function writeInfraFixture(root: string, manifest: unknown): Promise<void> {
  const catalog = `${root}/templates/features/probe`;
  await Bun.write(`${catalog}/feature.json`, JSON.stringify(manifest));
  for (const path of ["server/wiring.ts", "tests/probe.test.ts"]) {
    await Bun.write(`${catalog}/${path}`, "");
  }
}

/** Sorted install destinations for a catalog feature; the manifest tests share the plan read. */
async function installDestinations(name: string): Promise<string[]> {
  const manifest = await readFeatureManifest(repoRoot, name);
  return planFeatureInstall(manifest)
    .map((entry) => entry.destination)
    .sort();
}

test("the mail infra manifest validates and plans server-only destinations", async () => {
  const manifest = await readFeatureManifest(repoRoot, "mail");
  if (manifest.kind !== "infra") throw new Error("mail must stay an infra feature");
  expect(manifest.requires).toEqual(["mail"]);
  expect(manifest.wiring).toEqual(["context", "bootstrap", "cloudflare", "jobs", "notifications"]);

  const destinations = await installDestinations("mail");
  expect(destinations).toContain("apps/server/features/mail/wiring.ts");
  expect(destinations).toContain("apps/server/features/mail/channel.ts");
  expect(destinations).toContain("apps/server/tests/features/mail/mail.test.ts");
  expect(destinations.some((destination) => destination.startsWith("apps/web/"))).toBe(false);
});

test("infra-kind validation rejects web wiring, unknown operations, and an empty requires", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-feature-${crypto.randomUUID()}`;
  try {
    await writeInfraFixture(root, infraManifest);
    const manifest = await readFeatureManifest(root, "probe");
    expect(manifest.kind).toBe("infra");
    expect(manifest.requires).toEqual(["mail"]);
    const destinations = planFeatureInstall(manifest).map((entry) => entry.destination);
    expect(destinations).toContain("apps/server/features/probe/wiring.ts");
    expect(destinations).toContain("apps/server/tests/features/probe/probe.test.ts");

    await writeInfraFixture(root, { ...infraManifest, nav: { titleKey: "navigation.probe", url: "/probe" } });
    await expect(readFeatureManifest(root, "probe")).rejects.toThrow(/infra feature/);

    await writeInfraFixture(root, { ...infraManifest, wiring: ["teleport"] });
    await expect(readFeatureManifest(root, "probe")).rejects.toThrow(/known operation/);

    await writeInfraFixture(root, { ...infraManifest, wiring: ["context", "context"] });
    await expect(readFeatureManifest(root, "probe")).rejects.toThrow(/twice/);

    // An infra feature that adds no catalog package may leave `requires` empty.
    await writeInfraFixture(root, { ...infraManifest, requires: [] });
    const withoutPackage = await readFeatureManifest(root, "probe");
    expect(withoutPackage.requires).toEqual([]);

    // Migrations belong to server and infra kinds; the installer numbers them into the ledger.
    await writeInfraFixture(root, {
      ...infraManifest,
      requires: [],
      migrations: ["migrations/0001_probe.ts"],
    });
    await Bun.write(`${root}/templates/features/probe/migrations/0001_probe.ts`, "");
    const withMigration = await readFeatureManifest(root, "probe");
    if (withMigration.kind !== "infra") throw new Error("probe must stay an infra feature");
    expect(withMigration.migrations).toEqual(["migrations/0001_probe.ts"]);

    await writeInfraFixture(root, {
      ...infraManifest,
      files: { ...infraManifest.files, web: ["web/screens/probe.tsx"] },
    });
    await expect(readFeatureManifest(root, "probe")).rejects.toThrow(/infra feature/);
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("infra wiring edits the composition root and is idempotent", async () => {
  const manifest = await readFeatureManifest(repoRoot, "mail");
  if (manifest.kind !== "infra") throw new Error("mail must stay an infra feature");
  const edits = await planInfraWiring(repoRoot, manifest);
  expect(edits.map((entry) => entry.path).sort()).toEqual([
    "apps/server/bootstrap/bootstrap.ts",
    "apps/server/bootstrap/cloudflare-context.ts",
    "apps/server/bootstrap/context.ts",
    "apps/server/features/jobs.ts",
    "apps/server/features/notifications/channels/registry.ts",
    "apps/server/features/notifications/types.ts",
  ]);
  for (const edit of edits) {
    expect(["added", "present"]).toContain(edit.status);
    expect(edit.source.length).toBeGreaterThan(0);
  }

  const context = edits.find((entry) => entry.path === "apps/server/bootstrap/context.ts");
  expect(context?.source).toContain('import type { Mailer } from "@bun-erp/mail/server";');
  expect(context?.source).toContain("mail: Mailer;");
  const registry = edits.find((entry) => entry.path === "apps/server/features/notifications/channels/registry.ts");
  expect(registry?.source).toContain("mailChannel");
  const jobs = edits.find((entry) => entry.path === "apps/server/features/jobs.ts");
  expect(jobs?.source).toContain("registerMailJobs(registry, ctx.mail);");
  expect(jobs?.source).toContain('ctx: Pick<AppContext, "env" | "db" | "logger" | "mail">');
});

test("the organizations manifest is an infra feature without a package, with a migration", async () => {
  const manifest = await readFeatureManifest(repoRoot, "organizations");
  if (manifest.kind !== "infra") throw new Error("organizations must stay an infra feature");
  expect(manifest.requires).toEqual([]);
  expect(manifest.wiring).toEqual(["auth-plugin", "auth-schema", "session-field", "schema-export"]);
  expect(manifest.migrations).toEqual(["migrations/0001_organizations.ts"]);

  const destinations = await installDestinations("organizations");
  expect(new Set(destinations)).toEqual(
    new Set([
      "apps/server/features/organizations/plugin.ts",
      "apps/server/features/organizations/schema.ts",
      "apps/server/tests/features/organizations/organizations.test.ts",
    ]),
  );
  expect(destinations.some((destination) => destination.startsWith("apps/web/"))).toBe(false);
});

test("organizations wiring registers the plugin, schema map, session field, and export", async () => {
  const manifest = await readFeatureManifest(repoRoot, "organizations");
  if (manifest.kind !== "infra") throw new Error("organizations must stay an infra feature");
  const edits = await planInfraWiring(repoRoot, manifest);
  const paths = edits.map((entry) => entry.path).sort();
  expect(paths).toEqual([
    "apps/server/database/schema.ts",
    "apps/server/features/identity/auth.ts",
    "apps/server/features/identity/schema.ts",
  ]);
  for (const edit of edits) expect(["added", "present"]).toContain(edit.status);

  // One operation per file still composes: auth-plugin and auth-schema edit the same file.
  const auth = edits.find((entry) => entry.path === "apps/server/features/identity/auth.ts");
  expect(auth?.source).toContain('import { createOrganizationPlugin } from "../organizations/plugin.ts";');
  expect(auth?.source).toContain("plugins: [createOrganizationPlugin()],");
  expect(auth?.source).toContain("organization: organizations");
  expect(auth?.source).toContain("member: members");
  expect(auth?.source).toContain("invitation: invitations");

  const identity = edits.find((entry) => entry.path === "apps/server/features/identity/schema.ts");
  expect(identity?.source).toContain(
    'activeOrganizationId: uuid("active_organization_id").references(() => organizations.id, { onDelete: "set null" }),',
  );
  expect(identity?.source).toContain('index("session_active_organization_idx").on(table.activeOrganizationId)');

  const schema = edits.find((entry) => entry.path === "apps/server/database/schema.ts");
  expect(schema?.source).toContain(
    'export { invitationRelations, invitations, memberRelations, members, organizationRelations, organizations } from "../features/organizations/schema.ts";',
  );
});

test("web-kind validation rejects server wiring and unknown kinds", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-feature-${crypto.randomUUID()}`;
  try {
    await writeWebFixture(root, { ...webManifest, permissionResource: "report" });
    await expect(readFeatureManifest(root, "reports")).rejects.toThrow(/web feature/);

    await writeWebFixture(root, {
      ...webManifest,
      files: { ...webManifest.files, server: ["server/feature.ts"], tests: ["tests/reports.test.ts"] },
    });
    await expect(readFeatureManifest(root, "reports")).rejects.toThrow(/web feature/);

    await writeWebFixture(root, { ...webManifest, kind: "widget" });
    await expect(readFeatureManifest(root, "reports")).rejects.toThrow(/kind/);

    await writeWebFixture(root, {
      ...webManifest,
      files: { ...webManifest.files, shared: ["../_shared/web/use-table-state.ts"] },
    });
    await expect(readFeatureManifest(root, "reports")).rejects.toThrow(/shared/);
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});
