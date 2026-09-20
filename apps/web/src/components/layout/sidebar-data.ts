import { type LucideIcon, ScrollText, ShieldCheck, Users } from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Item hanya tampil bila sesi memegang izin ini; kosong = selalu tampil. */
  permission?: string;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

/** Sumber tunggal navigasi — halaman baru menambah baris di sini, bukan mengubah sidebar. */
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
