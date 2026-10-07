import { expect, test } from "bun:test";
import { planFeatureWiring } from "@cli/lib/feature-wiring.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("server wiring registers the permission resource and the audit entity independently", async () => {
  await withTempRoot(
    {
      "apps/server/features/rbac/statements.ts":
        'export const statements = {\n  // @erp:permissions\n  audit: ["read"],\n} as const;',
      "apps/server/features/audit/redact.ts":
        "export const AUDIT_FIELDS = {\n  // @erp:audit\n} as const satisfies Record<string, readonly string[]>;",
      "apps/server/routes/api.ts":
        'import { auditFeature } from "../features/audit/feature.ts";\nconst FEATURES = [\n  auditFeature,\n  // @erp:routes\n] as const satisfies readonly FeatureDefinition[];\n',
      "apps/web/src/config/navigation.ts":
        'import { Bell, type LucideIcon } from "lucide-react";\nexport const navGroups = [\n  {\n    items: [\n      // @erp:nav\n    ],\n  },\n];\n',
      "packages/i18n/src/utils/messages/en-US.ts": 'export const enUS = {\n  "a": "A",\n} as const;\n',
      "packages/i18n/src/utils/messages/id-ID.ts":
        'export const idID = {\n  "a": "A",\n} satisfies Record<keyof typeof enUS, string>;\n',
    },
    async (root) => {
      const edits = await planFeatureWiring(
        root,
        { name: "reports", camel: "reports" },
        { server: { resource: "report", auditEntity: "reports", auditFields: ["id"] } },
      );
      const statements = edits.find((edit) => edit.path.endsWith("statements.ts"));
      expect(statements?.status).toBe("added");
      expect(statements?.source).toContain('"report": ["create", "read", "update", "delete"]');
      const audit = edits.find((edit) => edit.path.endsWith("redact.ts"));
      expect(audit?.status).toBe("added");
      expect(audit?.source).toContain('"reports": ["id"]');
    },
  );
});
