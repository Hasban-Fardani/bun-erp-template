/**
 * Theme decision logic, kept free of React and of build config so it can be tested directly.
 * `lib/theme.tsx` supplies the React provider and the build-time default.
 *
 * Theme is a runtime preference, not a build constant: the build still picks the initial value so
 * a deployment ships a sane default, but an operator can choose light, dark, or follow the device
 * and the choice survives reloads.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "erp.theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** The single rule that maps a stored preference and the device setting to a concrete palette. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function readStoredTheme(fallback: ThemePreference): ThemePreference {
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

/** Sets the palette attribute on `<html>`. `removeAttribute` restores the default (light) palette. */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}
