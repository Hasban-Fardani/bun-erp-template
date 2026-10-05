import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { uiConfig } from "../config/ui.ts";
import {
  applyTheme,
  persistTheme,
  type ResolvedTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  type ThemePreference,
} from "./theme.ts";

/**
 * React binding for the theme decision in `lib/theme.ts`. Applying the palette before React
 * paints (see `applyInitialTheme`, called from `main.tsx`) is what prevents a light flash on a
 * dark deployment.
 */

/** Runs before React renders so the first paint already carries the right palette. */
export function applyInitialTheme(): void {
  applyTheme(resolveTheme(readStoredTheme(uiConfig.theme), systemPrefersDark()));
}

type ThemeValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme(uiConfig.theme));
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => setSystemDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    persistTheme(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
