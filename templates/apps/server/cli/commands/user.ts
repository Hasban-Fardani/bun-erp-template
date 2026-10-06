import { eq } from "drizzle-orm";
import { formatIssues, parseKeyList } from "../../../../cli/lib/format.ts";
import { parseCommandOptions } from "../../../../cli/lib/options.ts";
import { resolveRequired } from "../../../../cli/lib/prompt.ts";
import { defineCommand } from "../../../../cli/registry.ts";
import { resolveDefaultOrganizationId } from "../../bootstrap/context.ts";
import { loadEnv } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { recordAudit, snapshot } from "../../features/audit/service.ts";
import { accounts, users } from "../../features/identity/schema.ts";
import {
  createUser,
  deleteUser,
  hashPassword,
  replaceUserRoles,
  revokeUserRole,
  updateUser,
} from "../../features/identity/service.ts";
import { createUserSchema, updateUserSchema } from "../../features/identity/validation.ts";
import { roles as roleTable } from "../../features/rbac/schema.ts";
import { assignRole, findRoleByKey, permissionsForUser, rolesForUser } from "../../features/rbac/service.ts";
import { cliActor, createCliContext, requireUserByEmail } from "../lib/context.ts";

export const commands = [
  // Chicken-and-egg escape hatch: the first owner cannot be created over HTTP that requires a role.
  defineCommand("user:create", async (args) => {
    const [emailArg, passwordArg, ...options] = args;
    const email = resolveRequired(emailArg, "Email");
    const password = resolveRequired(passwordArg, "Password");
    if (!email || !password) {
      process.stderr.write("Usage: bun erp user:create <email> <password> [--role <key>] [--name <name>]\n");
      process.stderr.write(
        "Run `bun erp role:list` to see available roles. The first user defaults to owner; later users default to staff.\n",
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
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const existingUser = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.organizationId, organizationId))
        .limit(1);
      roleKey ??= existingUser.length === 0 ? "owner" : "staff";

      const availableRoles = await ctx.db
        .select({ key: roleTable.key })
        .from(roleTable)
        .where(eq(roleTable.organizationId, organizationId))
        .orderBy(roleTable.key);
      const roleKeys = availableRoles.map(({ key }) => key);
      if (!roleKeys.includes(roleKey)) {
        throw new Error(
          `Unknown role "${roleKey}". Available: ${roleKeys.join(", ") || "none"}. Run bun erp role:list.`,
        );
      }

      const created = await createUser(
        ctx.db,
        organizationId,
        { ...parsedInput.data, roleKey },
        { userId: null, traceId: `cli-${Date.now()}`, label: "cli" },
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
    for (const u of rows) {
      const roles = (await rolesForUser(ctx.db, u.id)).map((r) => r.key).join(", ");
      process.stdout.write(`${u.email.padEnd(40)} ${u.name.padEnd(20)} ${roles || "—"}\n`);
    }
    process.stdout.write(`total: ${rows.length}\n`);
    await ctx.close();
  }),

  defineCommand("user:show", async (args) => {
    const parsed = parseCommandOptions(args, {});
    const email = resolveRequired(parsed.positional[0], "Email");
    if (!email) {
      process.stderr.write("Usage: bun erp user:show <email>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const user = await requireUserByEmail(ctx.db, email);
      const roles = await rolesForUser(ctx.db, user.id);
      const permissions = await permissionsForUser(ctx.db, user.id);
      process.stdout.write(`email:          ${user.email}\n`);
      process.stdout.write(`name:           ${user.name}\n`);
      process.stdout.write(`organizationId: ${user.organizationId ?? "—"}\n`);
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
        "Usage: bun erp user:edit <email> [--name <name>] [--verified|--unverified] [--roles a,b]\n",
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
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      if (Object.keys(patch.data).length > 0) {
        await updateUser(ctx.db, organizationId, user.id, patch.data, cliActor());
      }
      if (parsed.values.has("roles")) {
        const roleKeys = parseKeyList(parsed.values.get("roles") ?? "");
        await replaceUserRoles(ctx.db, organizationId, user.id, roleKeys, cliActor());
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
      process.stderr.write("Usage: bun erp user:delete <email> --force\n");
      process.exit(1);
    }
    if (!parsed.flags.has("force")) {
      process.stderr.write(`Refusing to delete a user without --force. Run: bun erp user:delete ${email} --force\n`);
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      await deleteUser(ctx.db, organizationId, user.id, cliActor());
      process.stdout.write(`Deleted user ${email}.\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("user:grant", async (args) => {
    const [emailArg, roleKey = "owner"] = args;
    const email = resolveRequired(emailArg, "Email");
    if (!email) {
      process.stderr.write("Usage: bun erp user:grant <email> [roleKey]\n");
      process.exit(1);
    }
    // slop-ok: user lookups repeat the same not-found guard per command on purpose.
    const ctx = await createCliContext({ migrateOnStart: false });
    const organizationId = await resolveDefaultOrganizationId(ctx.db);
    const userRows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) {
      process.stderr.write(`No user with email ${email}. Sign up first.\n`);
      await ctx.close();
      process.exit(1);
    }
    const role = await findRoleByKey(ctx.db, organizationId, roleKey);
    if (!role) {
      const available = await ctx.db
        .select({ key: roleTable.key })
        .from(roleTable)
        .where(eq(roleTable.organizationId, organizationId))
        .orderBy(roleTable.key);
      process.stderr.write(
        `No role "${roleKey}" in this organization. Available: ${available.map(({ key }) => key).join(", ") || "none"}. Run: bun erp role:list\n`,
      );
      await ctx.close();
      process.exit(1);
    }
    await assignRole(ctx.db, { userId: user.id, roleId: role.id });
    await recordAudit(ctx.db, {
      organizationId,
      actorId: null,
      actorLabel: "cli",
      event: "user.role_assigned",
      subjectType: "user",
      subjectId: user.id,
      after: snapshot("userRole", { userId: user.id, roleId: role.id, scopeType: null, scopeId: null }),
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
      process.stderr.write("Usage: bun erp user:revoke <email> <roleKey>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const organizationId = await resolveDefaultOrganizationId(ctx.db);
      const user = await requireUserByEmail(ctx.db, email);
      await revokeUserRole(ctx.db, organizationId, user.id, roleKey, cliActor());
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
      process.stderr.write("Usage: bun erp user:passwd <email> [sandi-baru]\n");
      process.exit(1);
    }
    const password = newPassword ?? Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6)).join("-");
    // slop-ok: user lookups repeat the same not-found guard per command on purpose.
    const ctx = await createCliContext({ migrateOnStart: false });
    const organizationId = await resolveDefaultOrganizationId(ctx.db);
    const userRows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) {
      process.stderr.write(`No user with email ${email}.\n`);
      await ctx.close();
      process.exit(1);
    }

    const hash = await hashPassword(password);
    await ctx.db.transaction(async (tx) => {
      const updated = await tx
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accounts.userId, user.id))
        .returning({ id: accounts.id });
      if (updated.length === 0) {
        await tx
          .insert(accounts)
          .values({ accountId: user.id, providerId: "credential", userId: user.id, password: hash });
      }
      await recordAudit(tx as unknown as Database, {
        organizationId,
        actorId: null,
        actorLabel: "cli",
        event: "user.password_reset",
        subjectType: "user",
        subjectId: user.id,
        traceId: `cli-${Date.now()}`,
      });
    });
    process.stdout.write(`Password updated: ${email}\nNew password: ${password}\n`);
    await ctx.close();
  }),
];
