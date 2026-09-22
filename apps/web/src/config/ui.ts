/**
 * UI config is read at build time from `VITE_*` env (public by design).
 * Swapping theme/title = editing .env, not editing components.
 */
export type ThemeConfig = {
  appName: string;
  /** Palette "kertas-tenang" (default) or "tinta-gelap". */
  theme: "kertas-tenang" | "tinta-gelap";
};

const raw = import.meta.env as Record<string, string | undefined>;

export const uiConfig: ThemeConfig = {
  appName: raw.VITE_APP_NAME ?? "ERP Template",
  theme: raw.VITE_THEME === "tinta-gelap" ? "tinta-gelap" : "kertas-tenang",
};
