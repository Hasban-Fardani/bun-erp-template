import type { enUS } from "./messages/en-US.ts";

export const DEFAULT_LOCALE = "en-US" as const;
export const SUPPORTED_LOCALES = ["en-US", "id-ID"] as const;
export const LOCALE_STORAGE_KEY = "bun-erp.locale";

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type MessageKey = keyof typeof enUS;
export type MessageCatalog = Readonly<Record<MessageKey, string>>;
export type MessageValues = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, values?: MessageValues) => string;
export type LocaleCandidate = string | readonly string[] | null | undefined;

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DeviceLocaleSource {
  language?: string;
  languages?: readonly string[];
}

export function isLocale(value: unknown): value is Locale {
  return value === "en-US" || value === "id-ID";
}

/** Resolves language tags to one of the shipped catalogs, falling back to English. */
export function resolveLocale(...candidates: readonly LocaleCandidate[]): Locale {
  for (const candidate of candidates) {
    const values = typeof candidate === "string" ? [candidate] : Array.isArray(candidate) ? candidate : [];
    for (const value of values) {
      const locale = localeFromTag(value);
      if (locale) return locale;
    }
  }
  return DEFAULT_LOCALE;
}

/** A saved choice wins; an unsupported saved tag allows device preferences to take over. */
export function resolveInitialLocale(storedLocale: string | null | undefined, deviceLocales?: LocaleCandidate): Locale {
  return localeFromTag(storedLocale) ?? resolveLocale(deviceLocales);
}

/** Browser globals are read only when this function is called, never while the package is imported. */
export function getDeviceLocales(source?: DeviceLocaleSource): string[] {
  try {
    const device = source ?? readDeviceLocaleSource();
    if (!device) return [];
    return [...(device.languages ?? []), device.language ?? ""].filter(Boolean);
  } catch {
    return [];
  }
}

/** Reads a supported saved locale without allowing storage failures to interrupt app startup. */
export function readStoredLocale(storage?: LocaleStorage): Locale | undefined {
  try {
    const value = (storage ?? readLocalStorage())?.getItem(LOCALE_STORAGE_KEY);
    return localeFromTag(value);
  } catch {
    return undefined;
  }
}

/** Persists only a supported locale and returns false when storage is unavailable or blocked. */
export function persistLocale(locale: Locale, storage?: LocaleStorage): boolean {
  try {
    const target = storage ?? readLocalStorage();
    if (!target || !isLocale(locale)) return false;
    target.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

/** Detects the best available locale from safe persistence and device language preferences. */
export function detectLocale(storage?: LocaleStorage): Locale {
  return resolveInitialLocale(readStoredLocale(storage), getDeviceLocales());
}

export function resolveMessage(
  key: MessageKey,
  messages: Partial<MessageCatalog>,
  fallbackMessages: MessageCatalog,
): string {
  return messages[key] ?? fallbackMessages[key] ?? key;
}

export function interpolateMessage(message: string, values?: MessageValues): string {
  if (!values) return message;
  return message.replace(/\{([A-Za-z][\w]*)\}/g, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(
  value: Date | number | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(locale, options).format(toDate(value));
}

export function formatDateTime(
  value: Date | number | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(locale, options).format(toDate(value));
}

export function formatRelativeTime(value: Date | number | string, locale: Locale, now = Date.now()): string {
  const seconds = Math.round((toDate(value).getTime() - now) / 1_000);
  const magnitude = Math.abs(seconds);
  const [unit, divisor] =
    magnitude < 60
      ? (["second", 1] as const)
      : magnitude < 3_600
        ? (["minute", 60] as const)
        : magnitude < 86_400
          ? (["hour", 3_600] as const)
          : magnitude < 2_592_000
            ? (["day", 86_400] as const)
            : magnitude < 31_536_000
              ? (["month", 2_592_000] as const)
              : (["year", 31_536_000] as const);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
}

function localeFromTag(value: string | null | undefined): Locale | undefined {
  const language = value?.trim().replaceAll("_", "-").toLowerCase();
  if (!language) return undefined;
  if (language === "id" || language.startsWith("id-")) return "id-ID";
  if (language === "en" || language.startsWith("en-")) return "en-US";
  return undefined;
}

function readDeviceLocaleSource(): DeviceLocaleSource | undefined {
  try {
    return globalThis.navigator;
  } catch {
    return undefined;
  }
}

function readLocalStorage(): LocaleStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}
