import { type LucideIcon, ScrollText, ShieldCheck, Users } from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Item shows only when the session holds this permission; empty = always visible. */
  permission?: string;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

/** Single source of navigation — a new page adds a row here, not a sidebar edit. */
export const navGroups: NavGroup[] = [
  {
    items: [{ title: "Pengguna", url: "/users", icon: Users, permission: "user.read" }],
  },
  {
    title: "Administrasi",
    items: [
      { title: "Peran & Izin", url: "/roles", icon: ShieldCheck, permission: "role.read" },
      { title: "Audit", url: "/audit", icon: ScrollText, permission: "audit.read" },
    ],
  },
];

/**
 * What this deployment actually opens, derived from `navGroups` rather than retyped. The login
 * panel lists modules instead of client logos: a template has no customers to name, but it does
 * know which modules this build ships, and that is the question "what am I signing into?"
 * answers.
 */
export const shippedModules: { title: string; icon: LucideIcon }[] = navGroups.flatMap((group) =>
  group.items.map((item) => ({ title: item.title, icon: item.icon })),
);
