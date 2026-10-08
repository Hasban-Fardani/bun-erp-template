import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyCatalogPackage } from "@cli/lib/package-catalog.ts";

async function fixture(template: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "erp-pkg-"));
  await Bun.$`git init -q ${root}`.quiet();
  await mkdir(join(root, "templates/packages/widget"), { recursive: true });
  await Bun.write(join(root, "templates/packages/widget/package.json"), '{"name":"@bun-erp/widget"}\n');
  await Bun.write(join(root, "package.json"), '{"workspaces":[]}\n');
  if (template) {
    await mkdir(join(root, "docs/template"), { recursive: true });
    await Bun.write(join(root, "docs/template/README.md"), "template\n");
  }
  return root;
}

async function untracked(root: string): Promise<string> {
  return (await Bun.$`git status --short --untracked-files=all -- packages`.cwd(root).text()).trim();
}

test("a catalog package installed in the template repository stays out of git status", async () => {
  const root = await fixture(true);
  try {
    await copyCatalogPackage(root, "widget");
    expect(await Bun.file(join(root, "packages/widget/package.json")).exists()).toBe(true);
    expect(await untracked(root)).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("in a project the installed package is real source and stays visible to git", async () => {
  const root = await fixture(false);
  try {
    await copyCatalogPackage(root, "widget");
    expect(await untracked(root)).toContain("packages/widget");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
