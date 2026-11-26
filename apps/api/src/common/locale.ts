/**
 * Languages Cluster speaks. English is the source language and the fallback.
 * Adding one: a web catalog (`apps/web/messages/<code>.json`), an API catalog
 * (`src/i18n/<code>.ts`) and the code here and in `apps/web/lib/i18n/locales.ts`.
 * Stored as plain strings, so a new language needs no migration.
 */
export const SUPPORTED_LOCALES = ["en", "es"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** A person's choice, else each fallback in order (organization, instance), else English (a value no longer supported falls through). */
export function effectiveLocale(choice: string | null | undefined, ...fallbacks: (string | null | undefined)[]): Locale {
  return [choice, ...fallbacks].find(isLocale) ?? DEFAULT_LOCALE
}
