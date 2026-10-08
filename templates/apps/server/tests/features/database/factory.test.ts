import { beforeEach, expect, test } from "bun:test";
import { defineFactory, requiredOverride } from "@/database/factories/define.ts";
import { roles } from "@/features/rbac/schema.ts";
import { createSeededContext } from "../../support/fixtures.ts";

const roleFactory = defineFactory(roles, (n) => ({ key: `role-${n}`, name: `Role ${n}` }));

beforeEach(() => roleFactory.reset());

test("make() is pure and numbers each call from a deterministic sequence", () => {
  expect(roleFactory.make()).toEqual({ key: "role-1", name: "Role 1" });
  expect(roleFactory.make()).toEqual({ key: "role-2", name: "Role 2" });
  roleFactory.reset();
  expect(roleFactory.make().key).toBe("role-1");
});

test("make() lets overrides win over the generated values", () => {
  expect(roleFactory.make({ name: "Custom" })).toEqual({ key: "role-1", name: "Custom" });
});

test("create() inserts one row and returns it with database defaults", async () => {
  const { db } = await createSeededContext();
  const role = await roleFactory.create(db, { description: "made by a factory" });
  expect(role).toMatchObject({ key: "role-1", name: "Role 1", description: "made by a factory", isSystem: false });
  expect(role.id).toBeString();
});

test("createMany() inserts distinct rows in one statement", async () => {
  const { db } = await createSeededContext();
  const made = await roleFactory.createMany(db, 3, { description: "bulk" });
  expect(made.map((role) => role.key)).toEqual(["role-1", "role-2", "role-3"]);
  expect(new Set(made.map((role) => role.id)).size).toBe(3);
});

test("createMany() with a count of zero inserts nothing", async () => {
  const { db } = await createSeededContext();
  expect(await roleFactory.createMany(db, 0)).toEqual([]);
});

test("createMany() rejects a negative or fractional count", async () => {
  const { db } = await createSeededContext();
  await expect(roleFactory.createMany(db, -1)).rejects.toThrow(/count/);
  await expect(roleFactory.createMany(db, 1.5)).rejects.toThrow(/count/);
});

test("a requiredOverride column must be supplied by the caller", async () => {
  const { db } = await createSeededContext();
  const tagged = defineFactory(roles, (n) => ({ key: `tag-${n}`, name: requiredOverride("name") }));
  expect(() => tagged.make()).toThrow(/"name".*override/);
  expect(tagged.make({ name: "given" }).name).toBe("given");
  expect((await tagged.create(db, { name: "stored" })).name).toBe("stored");
});
