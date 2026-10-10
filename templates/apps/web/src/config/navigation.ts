import type { MessageKey } from "@loom/i18n";
import { Bell, type LucideIcon, Sparkles } from "lucide-react";

export type NavItem = {
  titleKey: MessageKey;
  url: string;
  icon: LucideIcon;
  /** Item shows only when the session holds this permission; empty = always visible. */
  permission?: string;
  /**
   * Account-scoped pages with no backend permission (notifications) opt in explicitly. The
   * navigation test requires exactly one of `permission` or `alwaysVisible`, so an area cannot be
   * reachable but invisible by accident.
   */
  alwaysVisible?: boolean;
};

type NavGroup = {
  titleKey?: MessageKey;
  items: NavItem[];
};

/**
 * Single source of navigation — a new page adds a row here, not a sidebar edit. Catalog features
 * install their own row with `bun loom features:install`; the default app ships the inbox only.
 */
export const navGroups: NavGroup[] = [
  {
    items: [
      // @loom:nav
      { titleKey: "navigation.assistant", url: "/assistant", icon: Sparkles, permission: "ai.use" },
      { titleKey: "navigation.notifications", url: "/notifications", icon: Bell, alwaysVisible: true },
    ],
  },
];

/**
 * The navigation an account can actually reach. One filter shared by the sidebar, the command
 * palette and the overview, so a new area cannot appear in one surface and be missing in another.
 * Groups left empty drop out entirely rather than rendering a heading with nothing under it.
 */
export function visibleNavGroups(permissions: readonly string[]): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The nav item and group that own a pathname, used for breadcrumbs and the active indicator. */
export function navLocationForPath(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  for (const group of navGroups) {
    const item = group.items.find(
      (candidate) => pathname === candidate.url || pathname.startsWith(`${candidate.url}/`),
    );
    if (item) return { group, item };
  }
  return undefined;
}

/**
 * What this deployment actually opens, derived from `navGroups` rather than retyped. The login
 * panel lists features instead of client logos: a template has no customers to name, but it does
 * know which features this build ships, and that is the question "what am I signing into?"
 * answers.
 */
export const shippedFeatures: { titleKey: MessageKey; icon: LucideIcon }[] = navGroups.flatMap((group) =>
  group.items.map((item) => ({ titleKey: item.titleKey, icon: item.icon })),
);
