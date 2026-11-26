import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { formats } from "./formats"
import en from "../messages/en.json"
import { mergeMessages } from "../lib/i18n/merge"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  TIME_ZONE_COOKIE,
  isLocale,
  type Locale,
} from "../lib/i18n/locales"

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001/api/v1"

/** The instance's default language, for a first visit (no cookie yet). English if the API is down. */
async function instanceDefaultLocale(): Promise<Locale> {
  try {
    const res = await fetch(`${API_URL}/instance/public`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(2000),
    })
    const body = (await res.json()) as { defaultLocale?: unknown }
    return isLocale(body.defaultLocale) ? body.defaultLocale : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

function validTimeZone(zone: string | undefined): string {
  if (!zone) return "UTC"
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return zone
  } catch {
    return "UTC"
  }
}

/**
 * Language and zone of every render. The cookies follow the signed-in person's effective
 * language and their organization's zone (lib/i18n/sync.ts), so the server renders what the
 * client will: no hydration mismatch on dates.
 */
export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : await instanceDefaultLocale()

  const messages =
    locale === "en"
      ? en
      : mergeMessages(en, (await import(`../messages/${locale}.json`)).default)

  return {
    locale,
    messages,
    formats,
    timeZone: validTimeZone(store.get(TIME_ZONE_COOKIE)?.value),
    onError(error) {
      if (process.env.NODE_ENV !== "production")
        console.warn(`[i18n] ${error.message}`)
    },
  }
})
