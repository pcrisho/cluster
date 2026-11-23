/** Mirrors SUPPORTED_LOCALES in apps/api/src/common/locale.ts; a new language also needs `messages/<code>.json`. */
export const SUPPORTED_LOCALES = ["en", "es"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

/** Each language's name in itself, for the language pickers. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

/** Cookies the server reads to render in the right language and zone; set by `syncPreferences`. */
export const LOCALE_COOKIE = "cluster_locale"
export const TIME_ZONE_COOKIE = "cluster_tz"

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}
