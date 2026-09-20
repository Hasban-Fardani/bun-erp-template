/**
 * Konfigurasi UI dibaca saat build dari env `VITE_*` (public by design).
 * Ganti tema/title = ganti .env, bukan ubah komponen.
 */
export type ThemeConfig = {
  appName: string;
  /** Palet "kertas-tenang" (default) atau "tinta-gelap". */
  theme: "kertas-tenang" | "tinta-gelap";
};

const raw = import.meta.env as Record<string, string | undefined>;

export const uiConfig: ThemeConfig = {
  appName: raw.VITE_APP_NAME ?? "ERP Template",
  theme: raw.VITE_THEME === "tinta-gelap" ? "tinta-gelap" : "kertas-tenang",
};
