/**
 * Theme decision logic for the mobile shell, kept free of React so it can be tested directly.
 * It mirrors the web app's rule: a stored preference (or the device setting) picks one palette,
 * applied through `data-theme` on `<html>`.
 */
const THEME_STORAGE_KEY = "loom.theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function readStoredTheme(fallback: ThemePreference = "system"): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistTheme(preference: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked; the in-memory choice still applies for this session.
  }
}

export function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

/** Sets the palette attribute on `<html>`; `delete` restores the default (light) palette. */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}
