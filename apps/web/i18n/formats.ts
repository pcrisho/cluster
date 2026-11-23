import type { Formats } from "next-intl"

/**
 * Named formats for `format.dateTime(date, "<name>")`. Every instant is shown in the
 * organization's zone (the provider's `timeZone`); calendar dates go through `useDates().calendar`.
 */
export const formats = {
  dateTime: {
    /** 29 oct 2026 · Oct 29, 2026 */
    date: { day: "numeric", month: "short", year: "numeric" },
    /** 29 de octubre de 2026 · October 29, 2026 */
    dateLong: { day: "numeric", month: "long", year: "numeric" },
    /** 29 oct 2026, 14:05 · Oct 29, 2026, 2:05 PM */
    dateTime: {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    /** 14:05 · 2:05 PM */
    time: { hour: "numeric", minute: "2-digit" },
    /** octubre de 2026 · October 2026 */
    monthYear: { month: "long", year: "numeric" },
    /** 29 oct · Oct 29 */
    monthDay: { day: "numeric", month: "short" },
  },
} satisfies Formats

export type DateFormat = keyof typeof formats.dateTime
