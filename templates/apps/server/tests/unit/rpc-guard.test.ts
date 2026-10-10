import { expect, test } from "bun:test";
import { checkRpc } from "@cli/gates/rpc-guard.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("export * from a server module is a runtime import, however it is spaced", async () => {
  await withTempRoot(
    {
      "apps/web/package.json": "{}",
      "apps/web/src/lib/rpc.ts": 'import { hc } from "hono/client";\nexport const rpc = hc<AppType>("/").api.v1;',
      "apps/web/src/reexport.ts": 'export*from"@loom/server/routes/api.ts";',
      "apps/web/src/spaced.ts": 'export * from "@loom/server/routes/api.ts";',
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
        'export type * from "@loom/server/routes/api.ts";',
        'import type { AppType } from "@loom/server";',
        'export type { AppType } from "@loom/server";',
        'import { type AppType as Type } from "@loom/server";',
      ].join("\n"),
    },
    async (root) => {
      const findings = await checkRpc(root);
      expect(findings).toEqual([]);
    },
  );
});

test("feature routes keep the house Hono helpers instead of the library defaults", async () => {
  await withTempRoot(
    {
      "apps/server/package.json": "{}",
      "apps/server/routes/api.ts": 'export const API_PREFIX = "/api/v1";',
      "apps/server/features/orders/route.ts": [
        'import { Hono } from "hono";',
        'import { zValidator } from "@hono/zod-validator";',
        'import { describeRoute } from "hono-openapi";',
        'export const routes = new Hono().get("/", describeRoute({}), zValidator("query", schema), (c) => c.json({}));',
      ].join("\n"),
      "apps/server/features/files/route.ts": "export const download = (c) => c.body(bytes, 200, headers);",
    },
    async (root) => {
      const findings = await checkRpc(root);
      const orders = findings.filter((finding) => finding.startsWith("apps/server/features/orders/route.ts"));
      expect(orders.map((finding) => finding.split(": ")[1])).toEqual([
        "use factory.createApp() from http/factory.ts, not new Hono()",
        "use validate() from http/helpers/validate.ts, not zValidator",
        "use doc() from http/helpers/api-docs.ts, not describeRoute",
        "return ok(c, data) or throw ApiError, not c.json()",
      ]);
      expect(findings.some((finding) => finding.includes("features/files"))).toBe(false);
    },
  );
});
