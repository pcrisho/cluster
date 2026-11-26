import { useLocale } from "next-intl"
import { enUS, es, type Locale as DateFnsLocale } from "date-fns/locale"
import type { Locale } from "./locales"

const DATE_FNS: Record<Locale, DateFnsLocale> = { en: enUS, es }

/** date-fns locale of the current language, for the calendar (react-day-picker) and date-fns formats. */
export function useDateFnsLocale(): DateFnsLocale {
  return DATE_FNS[useLocale()]
}
