import { expect, test } from "bun:test";
import { findCodeSlop } from "@cli/gates/slop.ts";
import { withTempRoot } from "./support/temp-root.ts";

test("cli and cli/gates are scanned once, not twice", async () => {
  await withTempRoot(
    {
      "cli/gates/duplicate.ts": "// This file stores the audit rows.\nconst rows = 1;\nvoid rows;\n",
    },
    async (root) => {
      const findings = await findCodeSlop(root);
      const narrative = findings.filter(
        (finding) => finding.startsWith("cli/gates/duplicate.ts") && finding.includes("narrative comment"),
      );
      expect(narrative).toHaveLength(1);
    },
  );
});

test("a bare slop-ok marker without a reason does not exempt the line", async () => {
  await withTempRoot(
    {
      "cli/gates/bare.ts": "// This file stores the audit rows. // slop-ok:\nconst rows = 1;\nvoid rows;\n",
    },
    async (root) => {
      const findings = await findCodeSlop(root);
      const narrative = findings.filter(
        (finding) => finding.includes("bare.ts") && finding.includes("narrative comment"),
      );
      expect(narrative).toHaveLength(1);
    },
  );
});

test("a slop-ok marker with a reason on the same line exempts that line", async () => {
  await withTempRoot(
    {
      "cli/gates/marked.ts":
        "// This file stores the audit rows. // slop-ok: the single writer of this table\nexport const rows = 1;\n",
    },
    async (root) => {
      const findings = await findCodeSlop(root);
      const narrative = findings.filter(
        (finding) => finding.includes("marked.ts") && finding.includes("narrative comment"),
      );
      expect(narrative).toHaveLength(0);
    },
  );
});
