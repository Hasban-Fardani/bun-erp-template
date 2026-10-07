import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
 * React binding for the theme decision in `lib/theme.ts`. Applying the palette before React paints
 * (see `applyInitialTheme`, called from `main.tsx`) prevents a light flash on a dark device.
 */
export function applyInitialTheme(): void {
  applyTheme(resolveTheme(readStoredTheme(), systemPrefersDark()));
}

type ThemeValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme());
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
