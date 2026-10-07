import { expect, test } from "bun:test";
import { checkTdd } from "@cli/gates/tdd.ts";
import { repoRoot } from "@cli/lib/repo.ts";

async function writeFixture(withTest: boolean): Promise<string> {
  const root = `/tmp/erp-tdd-${crypto.randomUUID()}`;
  await Bun.write(`${root}/apps/server/features/ghost/route.ts`, "");
  if (withTest) await Bun.write(`${root}/apps/server/tests/features/ghost/ghost.test.ts`, "// test");
  return root;
}

test("a feature without a test is a finding", async () => {
  const root = await writeFixture(false);
  expect((await checkTdd(root)).map((finding) => finding.rule)).toEqual(["TDD_TEST_MISSING"]);
  await Bun.$`rm -rf ${root}`;
});

test("a feature with a test passes", async () => {
  const root = await writeFixture(true);
  expect(await checkTdd(root)).toEqual([]);
  await Bun.$`rm -rf ${root}`;
});

test("every shipped server feature has a test", async () => {
  expect(await checkTdd(repoRoot)).toEqual([]);
});
