import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/bootstrap/context.ts";
import { commands } from "@/cli/commands/role.ts";
import { roles } from "@/features/rbac/schema.ts";
import { permissionsForRole } from "@/features/rbac/service.ts";
import { createSeededContext } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

/**
 * Runs the CLI handler in-process against the disposable test database. `loadEnv()` is called
 * inside the command, so the override only has to be live for the duration of the run.
 */
async function runRoleCreate(args: string[]): Promise<void> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  try {
    const command = commands.find((entry) => entry.name === "role:create");
    if (!command) throw new Error("role:create command missing");
    await command.run(args);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

test("role:create with an unknown permission key leaves no half-created role", async () => {
  await expect(runRoleCreate(["ghost", "--permissions", "nope.nope"])).rejects.toThrow();

  const rows = await ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.key, "ghost"));
  expect(rows).toEqual([]);
});

test("role:create with valid permissions creates the role and its grants together", async () => {
  await runRoleCreate(["valid-role", "--name", "Valid", "--permissions", "audit.read,user.read"]);

  const rows = await ctx.db.select().from(roles).where(eq(roles.key, "valid-role")).limit(1);
  expect(rows).toHaveLength(1);
  expect(await permissionsForRole(ctx.db, rows[0]?.id as string)).toEqual(["audit.read", "user.read"]);
});
