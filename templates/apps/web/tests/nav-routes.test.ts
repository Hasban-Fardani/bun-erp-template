import { expect, test } from "bun:test";
import { navGroups } from "../src/config/navigation.ts";
import { registeredPaths } from "../src/lib/navigation-paths.ts";

/**
 * Hard template rule: the sidebar must never point somewhere that does not exist.
 * A "Peran & Izin" menu opening NotFound is a bug that slipped through precisely because
 * nothing linked the nav list to the route list.
 */
test("every navigation item points at a registered route", () => {
  const missing = navGroups
    .flatMap((group) => group.items)
    .map((item) => item.url)
    .filter((url) => !registeredPaths.includes(url));

  expect(missing).toEqual([]);
});

test("every navigation item declares a backend permission or opts into always-visible", () => {
  const unguarded = navGroups
    .flatMap((group) => group.items)
    .filter((item) => !item.permission && !item.alwaysVisible)
    .map((item) => item.url);

  expect(unguarded).toEqual([]);
});

/**
 * The reverse direction: a screen that exists but has no navigation row is reachable by URL only
 * and invisible to the sidebar, command palette, and overview. Home is the deliberate exception —
 * it is reached from the logo, not a menu row.
 */
const HIDDEN_ROUTES = new Set(["/"]);

test("every authenticated screen is navigable or explicitly hidden", () => {
  const files = [...new Bun.Glob("src/pages/_authenticated/*.tsx").scanSync({ cwd: `${import.meta.dir}/..` })];
  const paths = files
    .map((file) => file.slice(file.lastIndexOf("/") + 1).replace(/\.tsx$/, ""))
    .filter((name) => name !== "route")
    .map((name) => (name === "index" ? "/" : `/${name}`));
  const navUrls = new Set(navGroups.flatMap((group) => group.items).map((item) => item.url));

  const orphaned = paths.filter((path) => !navUrls.has(path) && !HIDDEN_ROUTES.has(path));
  expect(orphaned).toEqual([]);
});
