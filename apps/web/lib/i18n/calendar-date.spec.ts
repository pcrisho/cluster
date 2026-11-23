import { formatCalendarDate, todayIn } from "./calendar-date"

describe("formatCalendarDate", () => {
  const short = { day: "numeric", month: "short", year: "numeric" } as const

  it("shows the date it is, in the language asked", () => {
    expect(formatCalendarDate("en", "2026-11-30", short)).toBe("Nov 30, 2026")
    expect(formatCalendarDate("es", "2026-11-30", short)).toBe("30 nov 2026")
  })

  it("never moves a day, whatever the process zone", () => {
    expect(formatCalendarDate("en", "2026-01-01T00:00:00.000Z", short)).toBe(
      "Jan 1, 2026"
    )
    expect(formatCalendarDate("en", "2026-12-31", short)).toBe("Dec 31, 2026")
  })
})

describe("todayIn", () => {
  it("is the calendar date in the zone, not in UTC", () => {
    const now = new Date("2026-10-30T03:00:00Z")
    expect(todayIn("UTC", now)).toBe("2026-10-30")
    expect(todayIn("America/Lima", now)).toBe("2026-10-29")
    expect(todayIn("Asia/Tokyo", now)).toBe("2026-10-30")
  })
})
