/**
 * API origin for the mobile app. A browser or Vite dev build falls back to same-origin requests;
 * a Capacitor webview cannot, so a native shell with no configured origin fails loudly instead of
 * calling the webview origin and returning 404s.
 */
type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

export function isNativePlatform(global: unknown = globalThis): boolean {
  return (global as CapacitorGlobal).Capacitor?.isNativePlatform?.() === true;
}

export function resolveApiBase(configured: string | undefined, native: boolean): string {
  const base = configured?.trim().replace(/\/+$/, "") ?? "";
  if (base) return base;
  if (native)
    throw new Error("VITE_API_BASE_URL is required for native builds; the Capacitor webview origin is not the API.");
  return "";
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL, isNativePlatform());
