import { formatIssues, humanizeKey, parseKeyList } from "@cli/lib/format.ts";
import { parseCommandOptions } from "@cli/lib/options.ts";
import { resolveRequired } from "@cli/lib/prompt.ts";
import { defineCommand } from "@cli/registry.ts";
import { roles as roleTable } from "../../features/rbac/schema.ts";
import {
  createRoleWithPermissions,
  deleteRole,
  permissionsForRole,
  setRolePermissions,
  updateRole,
} from "../../features/rbac/service.ts";
import { createRoleSchema, updateRoleSchema } from "../../features/rbac/validation.ts";
import { cliActor, createCliContext, requireRoleByKey } from "../lib/context.ts";

export const commands = [
  defineCommand("role:list", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const availableRoles = await ctx.db
        .select({ key: roleTable.key, name: roleTable.name, isSystem: roleTable.isSystem })
        .from(roleTable)
        .orderBy(roleTable.key);
      if (availableRoles.length === 0) {
        process.stdout.write("No roles found. Run `bun loom db:seed` first.\n");
        return;
      }
      for (const role of availableRoles) {
        process.stdout.write(`${role.key.padEnd(16)} ${role.name}${role.isSystem ? " (system)" : ""}\n`);
      }
      process.stdout.write("Use a role key with `bun loom user:create ... --role <key>`.\n");
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("role:show", async (args) => {
    const key = resolveRequired(args[0], "Role key");
    if (!key) {
      process.stderr.write("Usage: bun loom role:show <key>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const role = await requireRoleByKey(ctx.db, key);
      const permissions = await permissionsForRole(ctx.db, role.id);
      process.stdout.write(`key:         ${role.key}\n`);
      process.stdout.write(`name:        ${role.name}\n`);
      process.stdout.write(`description: ${role.description || "—"}\n`);
      process.stdout.write(`type:        ${role.isSystem ? "system" : "custom"}\n`);
      process.stdout.write(`permissions: ${permissions.length}\n`);
      for (const permission of permissions) process.stdout.write(`  ${permission}\n`);
    } finally {
      await ctx.close();
    }
  }),

  // slop-ok: each command repeats its own artisan-style usage guard on purpose.
  defineCommand("role:create", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["name", "description", "permissions"] });
    const key = resolveRequired(parsed.positional[0], "Role key");
    if (!key) {
      process.stderr.write(
        "Usage: bun loom role:create <key> [--name <name>] [--description <text>] [--permissions a,b]\n",
      );
      process.exit(1);
    }
    const input = createRoleSchema.safeParse({
      key,
      name: parsed.values.get("name") ?? humanizeKey(key),
      ...(parsed.values.has("description") ? { description: parsed.values.get("description") } : {}),
    });
    if (!input.success) {
      process.stderr.write(`Invalid role details:\n${formatIssues(input.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const permissionKeys = parsed.values.has("permissions")
        ? parseKeyList(parsed.values.get("permissions") ?? "")
        : [];
      // Role row + grants in one transaction: a bad key must not leave a half-created role.
      const role = await createRoleWithPermissions(ctx.db, input.data, permissionKeys, cliActor());
      process.stdout.write(`Created role "${role.key}" (${role.name}) with ${permissionKeys.length} permission(s).\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("role:edit", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["name", "description", "permissions"] });
    const key = resolveRequired(parsed.positional[0], "Role key");
    if (!key) {
      process.stderr.write(
        "Usage: bun loom role:edit <key> [--name <name>] [--description <text>] [--permissions a,b]\n",
      );
      process.exit(1);
    }
    if (parsed.values.size === 0) {
      process.stderr.write("Provide at least one of --name, --description, or --permissions.\n");
      process.exit(1);
    }
    const patch =
      parsed.values.has("name") || parsed.values.has("description")
        ? updateRoleSchema.safeParse({
            ...(parsed.values.has("name") ? { name: parsed.values.get("name") } : {}),
            ...(parsed.values.has("description") ? { description: parsed.values.get("description") } : {}),
          })
        : undefined;
    if (patch && !patch.success) {
      process.stderr.write(`Invalid role details:\n${formatIssues(patch.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const role = await requireRoleByKey(ctx.db, key);
      if (patch?.success) await updateRole(ctx.db, role.id, patch.data, cliActor());
      if (parsed.values.has("permissions")) {
        const keys = parseKeyList(parsed.values.get("permissions") ?? "");
        await setRolePermissions(ctx.db, role.id, keys, cliActor());
      }
      process.stdout.write(`Updated role "${role.key}".\n`);
    } finally {
      await ctx.close();
    }
  }),

  // slop-ok: the force-delete guard is repeated by each destructive command on purpose.
  defineCommand("role:delete", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"] });
    const key = resolveRequired(parsed.positional[0], "Role key");
    if (!key) {
      process.stderr.write("Usage: bun loom role:delete <key> --force\n");
      process.exit(1);
    }
    // slop-ok: the force-delete guard is repeated by each destructive command on purpose.
    if (!parsed.flags.has("force")) {
      process.stderr.write(`Refusing to delete a role without --force. Run: bun loom role:delete ${key} --force\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const role = await requireRoleByKey(ctx.db, key);
      await deleteRole(ctx.db, role.id, cliActor());
      process.stdout.write(`Deleted role "${role.key}".\n`);
    } finally {
      await ctx.close();
    }
  }),
];
