import { ensureDirectory, withTempRoot } from "./temp-root.ts";

/**
 * Minimal but marker-complete copies of the six core files `make:feature` wires. The catalog
 * files carry explicit `// @loom:` markers at the insertion points; a missing marker here means
 * the generator must refuse before it writes anything.
 */
export const CORE_FILES: Record<string, string> = {
  "apps/server/features/rbac/statements.ts": [
    "export const statements = {",
    "  // @loom:permissions",
    '  audit: ["read"],',
    "} as const;",
  ].join("\n"),
  "apps/server/features/audit/redact.ts": [
    "export const AUDIT_FIELDS = {",
    '  role: ["id", "key"],',
    "  // @loom:audit",
    "} as const satisfies Record<string, readonly string[]>;",
  ].join("\n"),
  "apps/server/routes/api.ts": [
    'import { auditFeature } from "../features/audit/feature.ts";',
    "",
    "const FEATURES = [",
    "  auditFeature,",
    "  // @loom:routes",
    "] as const satisfies readonly FeatureDefinition[];",
    "",
    'export const API_PREFIX = "/api/v1";',
    "",
  ].join("\n"),
  "apps/web/src/config/navigation.ts": [
    'import { Bell, type LucideIcon, Users } from "lucide-react";',
    "",
    "export const navGroups = [",
    "  {",
    "    items: [",
    "      // @loom:nav",
    '      { titleKey: "navigation.users", url: "/users", icon: Users, permission: "user.read" },',
    "    ],",
    "  },",
    "];",
    "",
  ].join("\n"),
  "packages/i18n/src/utils/messages/en-US.ts": [
    "export const enUS = {",
    '  "common.loading": "Loading…",',
    "} as const;",
    "",
  ].join("\n"),
  "packages/i18n/src/utils/messages/id-ID.ts": [
    "export const idID = {",
    '  "common.loading": "Memuat…",',
    "} satisfies Record<keyof typeof enUS, string>;",
    "",
  ].join("\n"),
};

/** Creates a temp root with the core files, the migrations directory, and any overrides. */
export function withCoreFiles(
  overrides: Record<string, string>,
  run: (root: string) => Promise<void>,
  prefix = "make-feature-",
): Promise<void> {
  return withTempRoot(
    { ...CORE_FILES, ...overrides },
    async (root) => {
      await ensureDirectory(`${root}/apps/server/database/migrations`);
      await run(root);
    },
    prefix,
  );
}
