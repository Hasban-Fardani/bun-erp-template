# `@loom/i18n`

This workspace provides the shared English (US) and Indonesian locale for the web and mobile React apps. Import pure locale and formatting helpers from `@loom/i18n`; import `I18nProvider`, `useI18n`, and `LocaleSwitcher` from `@loom/i18n/react`.

The provider prefers a saved locale, then browser or device language, and falls back to `en-US`. It stores only `en-US` or `id-ID` in local storage and tolerates storage being unavailable. The Indonesian message module loads on demand. The package root does not load React or message catalogs, so server code can import the pure helpers without browser globals or app copy.

Add user-facing messages to `src/utils/messages/en-US.ts` first, then provide the matching key in `src/utils/messages/id-ID.ts`. Keep keys and technical identifiers in English. Use `t` for visible copy and the formatter methods returned by `useI18n` for locale-aware dates and numbers.
