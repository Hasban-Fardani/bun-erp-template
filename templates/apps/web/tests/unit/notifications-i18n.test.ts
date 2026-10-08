import { expect, test } from "bun:test";

const featureDir = new URL("../../src/features/notifications/", import.meta.url).pathname;

test("the notifications feature only uses notifications.* i18n keys", async () => {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const foreign: string[] = [];
  for await (const file of glob.scan(featureDir)) {
    const source = await Bun.file(`${featureDir}${file}`).text();
    for (const match of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!match[1]?.startsWith("notifications.")) foreign.push(`${file}: ${match[1]}`);
    }
  }
  expect(foreign).toEqual([]);
});
