import { expect, test } from "bun:test";
import type { InfraFeatureManifest } from "@cli/lib/feature-catalog.ts";
import { planInfraWiring } from "@cli/lib/infra-wiring.ts";
import { withTempRoot } from "./support/temp-root.ts";

/** One `context` op is enough: its editor has two expected edits (import + field) plus the marker. */
const contextManifest: InfraFeatureManifest = {
  kind: "infra",
  name: "probe",
  requires: [],
  wiring: ["context"],
  files: { server: [], tests: [] },
};

const PRISTINE = [
  'import type { Auth } from "../identity/auth.ts";',
  "// @loom:mail",
  'import type { Env } from "../config/index.ts";',
  "",
  "export type AppContext = {",
  "  env: Env;",
  "  auth: Auth;",
  "  storage: Storage;",
  "};",
  "",
].join("\n");

const WIRED = PRISTINE.replace(
  "// @loom:mail\n",
  '// @loom:mail\nimport type { Mailer } from "@loom/mail/server";\n',
).replace("  auth: Auth;", "  auth: Auth;\n  mail: Mailer;");

function withContext(source: string, run: (root: string) => Promise<void>): Promise<void> {
  return withTempRoot({ "apps/server/bootstrap/context.ts": source }, run, "infra-wiring-");
}

test("an untouched core file is wired at its marker", async () => {
  await withContext(PRISTINE, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.status).toBe("added");
    expect(edits[0]?.source).toContain('import type { Mailer } from "@loom/mail/server";');
    expect(edits[0]?.source).toContain("  mail: Mailer;");
  });
});

test("a fully wired core file reads as present and is left untouched", async () => {
  await withContext(WIRED, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits[0]?.status).toBe("present");
    expect(edits[0]?.source).toBe(WIRED);
  });
});

test("a half-wired core file reports partial instead of present", async () => {
  // The field landed but the import did not: the old symbol check called this "present".
  const half = PRISTINE.replace("  auth: Auth;", "  auth: Auth;\n  mail: Mailer;");
  await withContext(half, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits[0]?.status).toBe("partial");
    expect(edits[0]?.reason).toMatch(/half-wired/);
    expect(edits[0]?.source).toBe(half);
  });
});

test("the other half-wired direction also reports partial", async () => {
  const half = PRISTINE.replace("// @loom:mail\n", '// @loom:mail\nimport type { Mailer } from "@loom/mail/server";\n');
  await withContext(half, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits[0]?.status).toBe("partial");
    expect(edits[0]?.reason).toMatch(/half-wired/);
  });
});

test("a wired file without its marker reports partial, not present", async () => {
  const markerless = WIRED.replace("// @loom:mail\n", "");
  await withContext(markerless, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits[0]?.status).toBe("partial");
    expect(edits[0]?.reason).toMatch(/@loom:mail/);
  });
});

test("a markerless, unwired file is skipped with the marker in the reason", async () => {
  const markerless = PRISTINE.replace("// @loom:mail\n", "");
  await withContext(markerless, async (root) => {
    const edits = await planInfraWiring(root, contextManifest);
    expect(edits[0]?.status).toBe("skipped");
    expect(edits[0]?.reason).toMatch(/@loom:mail/);
  });
});

test("auth-reset wires the mail-backed sender; before the install password reset stays off", async () => {
  const manifest: InfraFeatureManifest = { ...contextManifest, wiring: ["auth-reset"] };
  const pristine = [
    "// @loom:mail",
    'import { betterAuth } from "better-auth";',
    "export const options = {",
    "  sendResetPassword: undefined,",
    "};",
    "",
  ].join("\n");
  await withTempRoot(
    { "apps/server/features/identity/auth.ts": pristine },
    async (root) => {
      const edits = await planInfraWiring(root, manifest);
      expect(edits[0]?.status).toBe("added");
      expect(edits[0]?.source).toContain('import { createPasswordResetSender } from "../mail/index.ts";');
      expect(edits[0]?.source).toContain("sendResetPassword: createPasswordResetSender(db),");
    },
    "infra-wiring-",
  );
});
