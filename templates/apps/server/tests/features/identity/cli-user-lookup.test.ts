import { beforeEach, expect, test } from "bun:test";
import type { AppContext } from "@/bootstrap/context.ts";
import { requireUserByEmail } from "@/cli/lib/context.ts";
import { createUser } from "@/features/identity/service.ts";
import { createSeededContext } from "../../support/fixtures.ts";

let ctx: AppContext;

const actor = { userId: null, traceId: "test", label: "test" } as const;

beforeEach(async () => {
  ctx = await createSeededContext();
});

test("requireUserByEmail finds the user regardless of case", async () => {
  const user = await createUser(
    ctx.db,
    { name: "Case", email: "case.user@example.test", password: "sandi-yang-panjang" },
    actor,
  );

  const found = await requireUserByEmail(ctx.db, "CASE.USER@EXAMPLE.TEST");
  expect(found.id).toBe(user.id);
});

test("requireUserByEmail still refuses an unknown email", async () => {
  await expect(requireUserByEmail(ctx.db, "nobody@example.test")).rejects.toThrow("nobody@example.test");
});
