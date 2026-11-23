import { useMemo } from "react"
import { useFormatter, useLocale, useNow, useTimeZone } from "next-intl"
import { formats, type DateFormat } from "@/i18n/formats"
import { formatCalendarDate, todayIn } from "./calendar-date"

/**
 * The one way to show a date. Instants (posted, updated, submitted) are shown in the
 * organization's zone; calendar dates (due dates, a certificate's issue date) as they are.
 */
export function useDates() {
  const format = useFormatter()
  const locale = useLocale()
  const timeZone = useTimeZone() ?? "UTC"
  // Relative times ("3 minutes ago") move on by themselves, once a minute.
  const now = useNow({ updateInterval: 60_000 })
  return useMemo(
    () => ({
      /** An instant, e.g. "Oct 29, 2026" or with "dateTime" "Oct 29, 2026, 2:05 PM". */
      instant: (date: string | Date, preset: DateFormat = "date") =>
        format.dateTime(new Date(date), preset),
      /** "3 days ago" / "hace 3 días". */
      relative: (date: string | Date) =>
        format.relativeTime(new Date(date), now),
      /** A "YYYY-MM-DD" date with no zone conversion. */
      calendar: (date: string, preset: DateFormat = "date") =>
        formatCalendarDate(locale, date, formats.dateTime[preset]),
      /** Today in the organization's zone, as "YYYY-MM-DD". */
      today: () => todayIn(timeZone),
      timeZone,
    }),
    [format, locale, timeZone, now]
  )
}
