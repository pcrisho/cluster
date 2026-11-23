/** A calendar date ("YYYY-MM-DD", or an ISO string starting with one) as midnight UTC. */
export function calendarDateToUtc(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`)
}

/**
 * Formats a calendar date (a due date, a certificate's issue date) as the date it is:
 * it is formatted at UTC midnight in UTC, so no zone can move it to the day before.
 */
export function formatCalendarDate(
  locale: string,
  date: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(calendarDateToUtc(date))
}

/** Today as a calendar date in a zone (the organization's). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}
