import { expect, test } from "bun:test";
import { createFileIndex } from "../../../../cli/lib/file-index.ts";

test("two gates asking for the same glob under one root scan the filesystem once", async () => {
  let scanCount = 0;
  const index = createFileIndex("/fixture-root", {
    scan: async function* (glob) {
      scanCount += 1;
      if (glob === "**/*.tsx") {
        yield "b.tsx";
        yield "a.tsx";
      }
    },
  });

  expect(await index.files("**/*.tsx")).toEqual(["a.tsx", "b.tsx"]);
  expect(await index.files(["**/*.tsx"])).toEqual(["a.tsx", "b.tsx"]);
  expect(scanCount).toBe(1);
});

test("distinct globs scan once each and merge into one sorted list", async () => {
  const globsSeen: string[] = [];
  const index = createFileIndex("/fixture-root", {
    scan: (glob) => {
      globsSeen.push(glob);
      return glob === "apps/**/*.ts" ? ["apps/z.ts"] : ["packages/a.ts"];
    },
  });

  const merged = await index.files(["apps/**/*.ts", "packages/**/*.ts"]);
  expect(merged).toEqual(["apps/z.ts", "packages/a.ts"]);
  expect(await index.files(["packages/**/*.ts", "apps/**/*.ts"])).toEqual(["apps/z.ts", "packages/a.ts"]);
  expect(globsSeen).toEqual(["apps/**/*.ts", "packages/**/*.ts"]);
});

test("text reads each file through the injected reader once", async () => {
  let readCount = 0;
  const index = createFileIndex("/fixture-root", {
    read: async (path) => {
      readCount += 1;
      return `contents of ${path}`;
    },
  });

  expect(await index.text("packages/a.ts")).toBe("contents of packages/a.ts");
  expect(await index.text("packages/a.ts")).toBe("contents of packages/a.ts");
  expect(readCount).toBe(1);
});
