import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  detectLocale,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  interpolateMessage,
  isLocale,
  type Locale,
  type MessageCatalog,
  type MessageKey,
  type MessageValues,
  persistLocale,
  resolveMessage,
} from "../utils/core.ts";
import { enUS } from "../utils/messages/en-US.ts";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatRelativeTime: (value: Date | number | string, now?: number) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState(() => initialLocale ?? detectLocale());
  const [loadedMessages, setLoadedMessages] = useState<{ locale: Locale; messages: MessageCatalog }>({
    locale: "en-US",
    messages: enUS,
  });

  useEffect(() => {
    let active = true;
    if (locale === "en-US") {
      setLoadedMessages({ locale, messages: enUS });
    } else {
      void import("../utils/messages/id-ID.ts")
        .then(({ idID }) => {
          if (active) setLoadedMessages({ locale, messages: idID });
        })
        .catch(() => {
          if (active) setLoadedMessages({ locale, messages: enUS });
        });
    }

    try {
      if (typeof document !== "undefined") document.documentElement.lang = locale;
    } catch {
      // Rendering still works in environments that restrict document access.
    }

    return () => {
      active = false;
    };
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    if (!isLocale(nextLocale)) return;
    persistLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const messages = loadedMessages.locale === locale ? loadedMessages.messages : enUS;
  const t = useCallback(
    (key: MessageKey, values?: MessageValues) => interpolateMessage(resolveMessage(key, messages, enUS), values),
    [messages],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatNumber: (number, options) => formatNumber(number, locale, options),
      formatDate: (date, options) => formatDate(date, locale, options),
      formatDateTime: (date, options) => formatDateTime(date, locale, options),
      formatRelativeTime: (date, now) => formatRelativeTime(date, locale, now),
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <select
      aria-label={t("locale.select")}
      className={className}
      value={locale}
      onChange={(event) => {
        const nextLocale = event.currentTarget.value;
        if (isLocale(nextLocale)) setLocale(nextLocale);
      }}
    >
      <option value="en-US">{t("locale.enUS")}</option>
      <option value="id-ID">{t("locale.idID")}</option>
    </select>
  );
}

export type { I18nValue };
