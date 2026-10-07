import { expect, test } from "bun:test";
import { helpSections } from "@cli/lib/help.ts";
import { commandNames } from "@cli/registry.ts";

test("the printed help covers every registered command, so the list cannot drift", async () => {
  const available = new Set(await commandNames());
  const listed = new Set(
    helpSections(available).flatMap(({ commands }) => commands.map(([name]) => name.split(" ")[0] ?? "")),
  );
  const missing = [...available].filter((name) => !listed.has(name)).sort();
  expect(missing).toEqual([]);
});

test("gate commands are derived from the gate catalog, not a hand-maintained list", async () => {
  const available = new Set(await commandNames());
  const listed = new Set(
    helpSections(available).flatMap(({ commands }) => commands.map(([name]) => name.split(" ")[0] ?? "")),
  );
  for (const command of ["check:tdd", "check:design", "check:copy", "check:motion"]) {
    expect(listed.has(command)).toBe(true);
  }
});
