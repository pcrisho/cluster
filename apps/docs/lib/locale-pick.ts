export const SUPPORTED_LOCALES = ["en", "es"] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_STORAGE_KEY = "cluster_docs_locale"

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

/**
 * Picks the target locale following:
 * 1. Stored choice in localStorage (under cluster_site_locale).
 * 2. First supported language found in navigator.languages.
 * 3. Fallback to "en".
 */
export function pickLocale(
  storedLocale: string | null | undefined,
  languages?: readonly string[] | null
): Locale {
  if (isSupportedLocale(storedLocale)) {
    return storedLocale
  }

  if (languages && Array.isArray(languages)) {
    for (const lang of languages) {
      if (!lang) continue
      const normalized = lang.toLowerCase()
      const primary = normalized.split("-")[0]
      if (primary === "es") return "es"
      if (primary === "en") return "en"
    }
  }

  return DEFAULT_LOCALE
}

export function getStoredLocale(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}
