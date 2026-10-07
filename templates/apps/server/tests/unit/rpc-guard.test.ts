import { expect, test } from "bun:test";
import { checkRpc } from "../../../../cli/gates/rpc-guard.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("export * from a server module is a runtime import, however it is spaced", async () => {
  await withTempRoot(
    {
      "apps/web/package.json": "{}",
      "apps/web/src/lib/rpc.ts": 'import { hc } from "hono/client";\nexport const rpc = hc<AppType>("/").api.v1;',
      "apps/web/src/reexport.ts": 'export*from"@bun-erp/server/routes/api.ts";',
      "apps/web/src/spaced.ts": 'export * from "@bun-erp/server/routes/api.ts";',
    },
    async (root) => {
      const findings = await checkRpc(root);
      expect(findings.some((finding) => finding.includes("apps/web/src/reexport.ts"))).toBe(true);
      expect(findings.some((finding) => finding.includes("apps/web/src/spaced.ts"))).toBe(true);
    },
  );
});

test("type-only star re-exports and type-only imports stay allowed", async () => {
  await withTempRoot(
    {
      "apps/web/package.json": "{}",
      "apps/web/src/lib/rpc.ts": 'import { hc } from "hono/client";\nexport const rpc = hc<AppType>("/").api.v1;',
      "apps/web/src/types.ts": [
        'export type * from "@bun-erp/server/routes/api.ts";',
        'import type { AppType } from "@bun-erp/server";',
        'export type { AppType } from "@bun-erp/server";',
        'import { type AppType as Type } from "@bun-erp/server";',
      ].join("\n"),
    },
    async (root) => {
      const findings = await checkRpc(root);
      expect(findings).toEqual([]);
    },
  );
});
