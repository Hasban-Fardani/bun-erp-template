import { formatIssues, parseKeyList } from "@cli/lib/format.ts";
import { parseCommandOptions } from "@cli/lib/options.ts";
import { resolveRequired } from "@cli/lib/prompt.ts";
import { defineCommand } from "@cli/registry.ts";
import { eq } from "drizzle-orm";
import { loadEnv } from "../../config/index.ts";
import { recordAudit, snapshot } from "../../features/audit/service.ts";
import { passwordHasherFor } from "../../features/identity/password.ts";
import { users } from "../../features/identity/schema.ts";
import {
  createUser,
  deleteUser,
  replaceUserRoles,
  resetUserPassword,
  revokeUserRole,
  updateUser,
} from "../../features/identity/service.ts";
import { createUserSchema, updateUserSchema } from "../../features/identity/validation.ts";
import { invalidateUser } from "../../features/rbac/cache.ts";
import { roles as roleTable } from "../../features/rbac/schema.ts";
import {
  assignRole,
  findRoleByKey,
  permissionsForUser,
  rolesForUser,
  rolesForUsers,
} from "../../features/rbac/service.ts";
import { cliActor, createCliContext, requireUserByEmail } from "../lib/context.ts";
import { generatePassword } from "../lib/password.ts";

export const commands = [
  // Chicken-and-egg escape hatch: the first owner cannot be created over HTTP that requires a role.
  defineCommand("user:create", async (args) => {
    // Google-only sign-in never uses the password, so an unguessable one is generated instead of asked
    // and the password argument may be left out (`user:create <email> --role owner`).
    const googleOnly = loadEnv().AUTH_PASSWORD_ENABLED === false;
    const skipPassword = googleOnly && (args[1] === undefined || args[1].startsWith("--"));
    const [emailArg, ...rest] = args;
    const [passwordArg, ...options] = skipPassword ? [undefined, ...rest] : rest;
    const email = resolveRequired(emailArg, "Email");
    const password = skipPassword ? generatePassword() : resolveRequired(passwordArg, "Password");
    if (!email || !password) {
      process.stderr.write("Usage: bun loom user:create <email> <password> [--role <key>] [--name <name>]\n");
      process.stderr.write(
        "Run `bun loom role:list` to see available roles. The first user defaults to owner; later users default to staff.\n",
      );
      process.exit(1);
    }
    let roleKey: string | undefined;
    let name: string | undefined;
    const positional: string[] = [];
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "--role" || option === "--name") {
        const value = options[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
        if (option === "--role") roleKey = value;
        else name = value;
        index += 1;
        continue;
      }
      if (option?.startsWith("--")) throw new Error(`Unknown option: ${option}`);
      positional.push(option ?? "");
    }

    if (positional.length > 0) {
      if (roleKey) throw new Error("Use either --role or the legacy positional role, not both");
      roleKey = positional[0];
      if (positional.length > 1) name = positional.slice(1).join(" ");
    }

    const parsedInput = createUserSchema.safeParse({
      email,
      password,
      name: name ?? email.split("@")[0] ?? "User",
      ...(roleKey ? { roleKey } : {}),
    });
    if (!parsedInput.success) {
      const details = parsedInput.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("\n");
      process.stderr.write(`Invalid user details:\n${details}\n`);
      process.exit(1);
    }

    const env = loadEnv();
    const ctx = await createCliContext({ migrateOnStart: false, env });
    try {
      const existingUser = await ctx.db.select({ id: users.id }).from(users).limit(1);
      roleKey ??= existingUser.length === 0 ? "owner" : "staff";

      const availableRoles = await ctx.db.select({ key: roleTable.key }).from(roleTable).orderBy(roleTable.key);
      const roleKeys = availableRoles.map(({ key }) => key);
      if (!roleKeys.includes(roleKey)) {
        throw new Error(
          `Unknown role "${roleKey}". Available: ${roleKeys.join(", ") || "none"}. Run bun loom role:list.`,
        );
      }

      const created = await createUser(
        ctx.db,
        { ...parsedInput.data, roleKey },
        { userId: null, traceId: `cli-${Date.now()}`, label: "cli" },
        passwordHasherFor(ctx.env).hash,
      );
      const target = `configured database (${ctx.env.APP_ENV}/${ctx.env.DATABASE_DRIVER})`;
      process.stdout.write(`Created ${created.email} (${created.roles.map((r) => r.key).join(", ")}) in ${target}.\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("user:list", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const rows = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(users.email);
    // One batched lookup for every row; a per-user query is an N+1 on a real directory.
    const rolesByUser = await rolesForUsers(
      ctx.db,
      rows.map((user) => user.id),
    );
    for (const u of rows) {
      const roles = (rolesByUser.get(u.id) ?? []).map((r) => r.key).join(", ");
      process.stdout.write(`${u.email.padEnd(40)} ${u.name.padEnd(20)} ${roles || "—"}\n`);
    }
    process.stdout.write(`total: ${rows.length}\n`);
    await ctx.close();
  }),

  defineCommand("user:show", async (args) => {
    const parsed = parseCommandOptions(args, {});
    const email = resolveRequired(parsed.positional[0], "Email");
    if (!email) {
      process.stderr.write("Usage: bun loom user:show <email>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      const roles = await rolesForUser(ctx.db, user.id);
      const permissions = await permissionsForUser(ctx.db, user.id);
      process.stdout.write(`email:          ${user.email}\n`);
      process.stdout.write(`name:           ${user.name}\n`);
      process.stdout.write(`emailVerified:  ${user.emailVerified ? "yes" : "no"}\n`);
      process.stdout.write(`roles:          ${roles.map((role) => role.key).join(", ") || "—"}\n`);
      process.stdout.write(`permissions:    ${permissions.length}\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("user:edit", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["verified", "unverified"], values: ["name", "roles"] });
    const email = resolveRequired(parsed.positional[0], "Email");
    if (!email) {
      process.stderr.write(
        "Usage: bun loom user:edit <email> [--name <name>] [--verified|--unverified] [--roles a,b]\n",
      );
      process.exit(1);
    }
    if (parsed.values.size === 0 && parsed.flags.size === 0) {
      process.stderr.write("Provide at least one of --name, --verified, --unverified, or --roles.\n");
      process.exit(1);
    }
    if (parsed.flags.has("verified") && parsed.flags.has("unverified")) {
      throw new Error("Use either --verified or --unverified, not both");
    }
    const patch = updateUserSchema.safeParse({
      ...(parsed.values.has("name") ? { name: parsed.values.get("name") } : {}),
      ...(parsed.flags.has("verified") ? { emailVerified: true } : {}),
      ...(parsed.flags.has("unverified") ? { emailVerified: false } : {}),
    });
    if (!patch.success) {
      process.stderr.write(`Invalid user details:\n${formatIssues(patch.error.issues)}\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      if (Object.keys(patch.data).length > 0) {
        await updateUser(ctx.db, user.id, patch.data, cliActor());
      }
      if (parsed.values.has("roles")) {
        const roleKeys = parseKeyList(parsed.values.get("roles") ?? "");
        await replaceUserRoles(ctx.db, user.id, roleKeys, cliActor());
      }
      process.stdout.write(`Updated user ${email}.\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("user:delete", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["force"] });
    const email = resolveRequired(parsed.positional[0], "Email");
    if (!email) {
      process.stderr.write("Usage: bun loom user:delete <email> --force\n");
      process.exit(1);
    }
    if (!parsed.flags.has("force")) {
      process.stderr.write(`Refusing to delete a user without --force. Run: bun loom user:delete ${email} --force\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      await deleteUser(ctx.db, user.id, cliActor());
      process.stdout.write(`Deleted user ${email}.\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("user:grant", async (args) => {
    const [emailArg, roleKey = "owner"] = args;
    const email = resolveRequired(emailArg, "Email");
    if (!email) {
      process.stderr.write("Usage: bun loom user:grant <email> [roleKey]\n");
      process.exit(1);
    }
    // slop-ok: user lookups repeat the same not-found guard per command on purpose.
    const ctx = await createCliContext({ migrateOnStart: false });
    const userRows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) {
      process.stderr.write(`No user with email ${email}. Sign up first.\n`);
      await ctx.close();
      process.exit(1);
    }
    const role = await findRoleByKey(ctx.db, roleKey);
    if (!role) {
      const available = await ctx.db.select({ key: roleTable.key }).from(roleTable).orderBy(roleTable.key);
      process.stderr.write(
        `No role "${roleKey}". Available: ${available.map(({ key }) => key).join(", ") || "none"}. Run: bun loom role:list\n`,
      );
      await ctx.close();
      process.exit(1);
    }
    await assignRole(ctx.db, { userId: user.id, roleId: role.id });
    // assignRole cannot invalidate after an outer commit it does not own, so the direct CLI
    // caller clears this process's cache itself. The server process expires by TTL (rbac/cache.ts).
    await invalidateUser(user.id);
    await recordAudit(ctx.db, {
      actorId: null,
      actorLabel: "cli",
      event: "user.role_assigned",
      subjectType: "user",
      subjectId: user.id,
      after: snapshot("userRole", { userId: user.id, roleId: role.id }),
      traceId: `cli-${Date.now()}`,
    });
    process.stdout.write(`Granted "${roleKey}" to ${email}.\n`);
    await ctx.close();
  }),

  defineCommand("user:revoke", async (args) => {
    const parsed = parseCommandOptions(args, {});
    const [emailArg, roleKeyArg] = parsed.positional;
    const email = resolveRequired(emailArg, "Email");
    const roleKey = resolveRequired(roleKeyArg, "Role key");
    if (!email || !roleKey) {
      process.stderr.write("Usage: bun loom user:revoke <email> <roleKey>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      // revokeUserRole invalidates after its own commit; this only clears this process's cache.
      // The server process keeps its own copy, bounded by the 30s TTL documented in rbac/cache.ts.
      await revokeUserRole(ctx.db, user.id, roleKey, cliActor());
      process.stdout.write(`Revoked "${roleKey}" from ${email}.\n`);
    } finally {
      await ctx.close();
    }
  }),

  // Password reset via CLI: the recovery path while no e-mail driver exists. Audit is still recorded.
  defineCommand("user:passwd", async (args) => {
    const [emailArg, newPassword] = args;
    const email = resolveRequired(emailArg, "Email");
    if (!email) {
      process.stderr.write("Usage: bun loom user:passwd <email> [sandi-baru]\n");
      process.exit(1);
    }
    // Math.random() must never produce a credential; the generator uses the platform CSPRNG.
    const password = newPassword ?? generatePassword();
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      await resetUserPassword(ctx.db, user.id, password, cliActor(), passwordHasherFor(ctx.env).hash);
      process.stdout.write(`Password updated: ${email}\nNew password: ${password}\n`);
    } finally {
      await ctx.close();
    }
  }),
];
