import { expect, test } from "bun:test";
import { checkArchitecture } from "../../../../gates/architecture-guard.ts";

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
      'import "@bun-erp/utils"; const page = import("../../web/src/main.tsx");',
    );
    await Bun.write(`${root}/apps/web/src/main.tsx`, 'import "@bun-erp/utils";');
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
      'import "@bun-erp/utils"; import { Button } from "@bun-erp/ui/atoms/button.tsx";',
    );
    expect(await checkArchitecture(root)).toEqual([]);

    await Bun.write(`${root}/packages/ui/src/organisms/table.tsx`, 'import { useQuery } from "@tanstack/react-query";');
    const forbiddenTanStack = await checkArchitecture(root);
    expect(forbiddenTanStack).toContain(
      "packages/ui/src/organisms/table.tsx: UI_APPLICATION_DEPENDENCY — @tanstack/react-query",
    );
  } finally {
    await Bun.$`rm -r ${root}`.quiet();
  }
});
