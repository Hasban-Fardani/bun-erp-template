import { expect, test } from "bun:test";
import { navGroups } from "../src/components/layout/sidebar-data.ts";
import { registeredPaths } from "../src/routes/route-tree.tsx";

/**
 * Hard template rule: the sidebar must never point somewhere that does not exist.
 * A "Peran & Izin" menu opening NotFound is a bug that slipped through precisely because
 * nothing linked the nav list to the route list.
 */
test("setiap item navigasi menunjuk path yang benar-benar terdaftar", () => {
  const missing = navGroups
    .flatMap((group) => group.items)
    .map((item) => item.url)
    .filter((url) => !registeredPaths.includes(url));

  expect(missing).toEqual([]);
});

test("setiap item navigasi punya izin yang ditegakkan backend", () => {
  const withoutPermission = navGroups
    .flatMap((group) => group.items)
    .filter((item) => !item.permission)
    .map((item) => item.url);

  expect(withoutPermission).toEqual([]);
});
