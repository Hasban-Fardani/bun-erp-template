import type { SessionView } from "../types/index.ts";

/**
 * Whether the Users screen offers "Impersonate" for a row. The server enforces the same policy
 * (403 for self, an owner, a user who can impersonate, or a nested start); this only keeps the UI
 * from offering an action that is certain to be refused.
 */
export function canImpersonate(
  session: Pick<SessionView, "permissions" | "user" | "impersonation">,
  target: { id: string; roles: readonly { key: string }[]; permissions: readonly string[] },
): boolean {
  if (!session.permissions.includes("user.impersonate")) return false;
  if (session.impersonation) return false;
  if (session.user?.id === target.id) return false;
  if (target.roles.some((role) => role.key === "owner")) return false;
  return !target.permissions.includes("user.impersonate");
}
