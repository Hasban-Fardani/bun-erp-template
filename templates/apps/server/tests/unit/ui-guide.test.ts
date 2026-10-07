import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkUiGuide } from "@cli/gates/ui-guide.ts";

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ui-guide-"));
  for (const [path, body] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await Bun.write(file, body);
  }
  return root;
}

test("flags a component module that the guide does not list", async () => {
  const root = await fixture({
    "packages/ui/src/atoms/button.tsx": "",
    "packages/ui/llms.txt": "# @bun-erp/ui\n",
  });
  try {
    const findings = await checkUiGuide(root);
    expect(findings.join("\n")).toContain("missing atoms/button.tsx");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("flags a guide entry whose module no longer exists", async () => {
  const root = await fixture({
    "packages/ui/src/atoms/button.tsx": "",
    "packages/ui/llms.txt":
      "# @bun-erp/ui\n\n| `atoms/button.tsx` | button | — |\n| `molecules/gone.tsx` | stale | — |\n",
  });
  try {
    const findings = await checkUiGuide(root);
    expect(findings.join("\n")).toContain("references molecules/gone.tsx");
    expect(findings.join("\n")).not.toContain("missing atoms/button.tsx");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("passes when every module is listed exactly once and nothing is stale", async () => {
  const root = await fixture({
    "packages/ui/src/atoms/button.tsx": "",
    "packages/ui/src/lib/cn.ts": "",
    "packages/ui/llms.txt": "# @bun-erp/ui\n\n| `atoms/button.tsx` | button | — |\n| `lib/cn.ts` | classes | — |\n",
  });
  try {
    expect(await checkUiGuide(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skips cleanly when packages/ui is not installed", async () => {
  const root = await fixture({ "package.json": "{}" });
  try {
    expect(await checkUiGuide(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
