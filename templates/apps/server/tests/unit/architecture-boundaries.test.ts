import { expect, test } from "bun:test";
import { checkArchitecture } from "@cli/gates/architecture-guard.ts";
import { clearFileIndexes } from "@cli/lib/file-index.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("atomic and application boundaries reject forbidden imports and permit shared UI", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-architecture-${Bun.randomUUIDv7()}`;
  try {
    await Bun.write(`${root}/apps/web/vite.config.ts`, "tanstackRouter({ autoCodeSplitting: true });");
    await Bun.write(`${root}/packages/ui/src/atoms/button.tsx`, 'import "../organisms/sheet.tsx";');
    await Bun.write(
      `${root}/packages/ui/src/organisms/table.tsx`,
      'export { query } from "../../../../apps/web/src/query.ts"; import { useQuery } from "@tanstack/react-query";',
    );
    await Bun.write(`${root}/packages/ui/src/misc/button.tsx`, "export const Button = () => null;");
    await Bun.write(
      `${root}/apps/mobile/src/main.tsx`,
      'import "@loom/utils"; const page = import("../../web/src/main.tsx");',
    );
    await Bun.write(`${root}/apps/web/src/main.tsx`, 'import "@loom/utils";');
    const red = await checkArchitecture(root);
    expect(red.some((finding) => finding.includes("ATOMIC_UPWARD_IMPORT"))).toBe(true);
    expect(red.some((finding) => finding.includes("UI_ATOMIC_LAYER"))).toBe(true);
    expect(red.some((finding) => finding.includes("UI_APPLICATION_DEPENDENCY"))).toBe(true);
    expect(red.some((finding) => finding.includes("MOBILE_WEB_SOURCE"))).toBe(true);
    await Bun.write(`${root}/packages/ui/src/atoms/button.tsx`, 'import type { ReactNode } from "react";');
    await Bun.write(
      `${root}/packages/ui/src/organisms/table.tsx`,
      'import { Button } from "../atoms/button.tsx"; import { useReactTable } from "@tanstack/react-table";',
    );
    await Bun.$`rm ${root}/packages/ui/src/misc/button.tsx`.quiet();
    await Bun.write(
      `${root}/apps/mobile/src/main.tsx`,
      'import "@loom/utils"; import { Button } from "@loom/ui/atoms/button.tsx";',
    );
    clearFileIndexes();
    expect(await checkArchitecture(root)).toEqual([]);

    await Bun.write(`${root}/packages/ui/src/organisms/table.tsx`, 'import { useQuery } from "@tanstack/react-query";');
    clearFileIndexes();
    const forbiddenTanStack = await checkArchitecture(root);
    expect(forbiddenTanStack).toContain(
      "packages/ui/src/organisms/table.tsx: UI_APPLICATION_DEPENDENCY — @tanstack/react-query",
    );
  } finally {
    await Bun.$`rm -r ${root}`.quiet();
  }
});

test("server feature boundaries require the target feature's index.ts", async () => {
  await withTempRoot(
    {
      "apps/server/features/rbac/index.ts": "export const permissionsForUser = () => [];",
      "apps/server/features/identity/policy.ts": 'import { permissionsForUser } from "../rbac/service.ts";',
      "apps/server/features/audit/policy.ts": 'import type { PermissionKey } from "../rbac/index.ts";',
    },
    async (root) => {
      const findings = await checkArchitecture(root);
      expect(findings).toContain(
        "apps/server/features/identity/policy.ts: FEATURE_BOUNDARY — ../rbac/service.ts bypasses features/rbac/index.ts",
      );
      expect(findings.some((finding) => finding.includes("audit/policy.ts"))).toBe(false);
    },
  );
});

test("catalog features are checked at their installed path", async () => {
  await withTempRoot(
    {
      "templates/features/departments/server/service.ts": 'import { auditChange } from "../audit/service.ts";',
    },
    async (root) => {
      const findings = await checkArchitecture(root);
      expect(findings).toContain(
        "templates/features/departments/server/service.ts: FEATURE_BOUNDARY — ../audit/service.ts bypasses features/audit/index.ts",
      );
    },
  );
});

test("deep relative imports are rejected in favour of the path aliases", async () => {
  await withTempRoot(
    {
      "apps/web/src/features/orders/api/queries.ts": 'import { rpc } from "../../../lib/rpc.ts";',
      "apps/server/tests/features/orders/orders.test.ts":
        'import type { AppContext } from "../../../bootstrap/context.ts";',
      "templates/apps/server/tests/unit/orders.test.ts": 'import { repoRoot } from "../../../../cli/lib/repo.ts";',
      "apps/web/src/features/orders/api/aliased.ts": 'import { rpc } from "@web/lib/rpc.ts";',
      "apps/server/features/orders/service.ts": 'import { rowsOf } from "@/database/rows.ts";',
    },
    async (root) => {
      const findings = await checkArchitecture(root);
      expect(findings).toContain(
        'apps/web/src/features/orders/api/queries.ts: NO_DEEP_RELATIVE — ../../../lib/rpc.ts uses three or more "../" segments; use a path alias',
      );
      expect(findings).toContain(
        'apps/server/tests/features/orders/orders.test.ts: NO_DEEP_RELATIVE — ../../../bootstrap/context.ts uses three or more "../" segments; use a path alias',
      );
      expect(findings).toContain(
        'templates/apps/server/tests/unit/orders.test.ts: NO_DEEP_RELATIVE — ../../../../cli/lib/repo.ts uses three or more "../" segments; use a path alias',
      );
      expect(findings.some((finding) => finding.includes("aliased.ts"))).toBe(false);
    },
  );
});
