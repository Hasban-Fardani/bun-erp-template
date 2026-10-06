/**
 * UI config is read at build time from `VITE_*` env (public by design).
 * Swapping theme/title = editing .env, not editing components.
 */
type ThemeConfig = {
  appName: string;
  theme: "light" | "dark";
};

const raw = import.meta.env as Record<string, string | undefined>;

export const uiConfig: ThemeConfig = {
  appName: raw.VITE_APP_NAME ?? "ERP Template",
  theme: raw.VITE_THEME === "dark" ? "dark" : "light",
};
