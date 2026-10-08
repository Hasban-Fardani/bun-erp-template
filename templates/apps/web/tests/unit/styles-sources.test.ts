import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Tailwind only emits classes it scans; the data-table package ships utilities (mobile full-width
// toolbar action, card rows) that the app source alone never mentions.
test("globals.css scans the opt-in data-table package for utility classes", async () => {
  const css = await Bun.file(resolve(import.meta.dir, "../../src/styles/globals.css")).text();
  expect(css).toContain('@source "../../../../packages/data-table/src";');
});
