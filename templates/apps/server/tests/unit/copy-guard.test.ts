import { expect, test } from "bun:test";
import { checkUserCopy } from "@cli/gates/copy-guard.ts";
import { clearFileIndexes } from "@cli/lib/file-index.ts";

test("copy gate ignores TypeScript arrow and generic syntax but rejects rendered permission IDs", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-copy-${Bun.randomUUIDv7()}`;
  try {
    await Bun.write(
      `${root}/apps/web/src/features/example/example.tsx`,
      'const records = load().then((store) => store.list<Draft>("drafts"));\nexport function Example() { return <p>Saved locally</p>; }',
    );
    clearFileIndexes();
    expect(await checkUserCopy(root)).toEqual([]);

    await Bun.write(
      `${root}/apps/web/src/features/example/example.tsx`,
      "export function Example() { return <p>audit.read</p>; }",
    );
    clearFileIndexes();
    expect(await checkUserCopy(root)).toMatchObject([{ rule: "USER_COPY_PERMISSION-ID" }]);

    const dynamicLabel = "$" + "{stage.name}, $" + "{valueFormatter(stage.value)}";
    await Bun.write(
      `${root}/apps/web/src/features/example/example.tsx`,
      `<button aria-label={\`${dynamicLabel}\`}>Open</button>`,
    );
    clearFileIndexes();
    expect(await checkUserCopy(root)).toEqual([]);
  } finally {
    await Bun.$`rm -r ${root}`.quiet();
  }
});
