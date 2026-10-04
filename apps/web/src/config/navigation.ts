import type { MessageKey } from "@bun-erp/i18n";
import { type LucideIcon, ScrollText, ShieldCheck, Users } from "lucide-react";

export type NavItem = {
  titleKey: MessageKey;
  url: string;
  icon: LucideIcon;
  /** Item shows only when the session holds this permission; empty = always visible. */
  permission?: string;
};

export type NavGroup = {
  titleKey?: MessageKey;
  items: NavItem[];
};

/** Single source of navigation — a new page adds a row here, not a sidebar edit. */
export const navGroups: NavGroup[] = [
  {
    items: [{ titleKey: "navigation.users", url: "/users", icon: Users, permission: "user.read" }],
  },
  {
    titleKey: "navigation.administration",
    items: [
      { titleKey: "navigation.roles", url: "/roles", icon: ShieldCheck, permission: "role.read" },
      { titleKey: "navigation.audit", url: "/audit", icon: ScrollText, permission: "audit.read" },
    ],
  },
];

/**
 * What this deployment actually opens, derived from `navGroups` rather than retyped. The login
 * panel lists features instead of client logos: a template has no customers to name, but it does
 * know which features this build ships, and that is the question "what am I signing into?"
 * answers.
 */
export const shippedFeatures: { titleKey: MessageKey; icon: LucideIcon }[] = navGroups.flatMap((group) =>
  group.items.map((item) => ({ titleKey: item.titleKey, icon: item.icon })),
);
