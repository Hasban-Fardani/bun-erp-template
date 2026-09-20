import { expect, test } from "bun:test";
import { navGroups } from "../src/components/layout/sidebar-data.ts";
import { registeredPaths } from "../src/routes/route-tree.tsx";

/**
 * Aturan keras template: sidebar tidak boleh mengarah ke tempat yang tidak ada.
 * Menu "Peran & Izin" yang membuka NotFound adalah bug yang lolos justru karena
 * tak ada yang menautkan daftar nav dengan daftar route.
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
