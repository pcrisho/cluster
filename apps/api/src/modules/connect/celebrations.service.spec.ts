import { completedYears, monthDayIn } from "./celebrations.service"

describe("monthDayIn", () => {
  // 02:00 UTC on 1 March is still the evening of 28 February in Lima (UTC-5).
  const instant = new Date("2026-03-01T02:00:00Z")

  it("uses the organization's calendar day, not the server's", () => {
    expect(monthDayIn(instant, "America/Lima")).toEqual({ month: 2, day: 28 })
    expect(monthDayIn(instant, "UTC")).toEqual({ month: 3, day: 1 })
  })

  it("falls back to UTC for an unknown time zone", () => {
    expect(monthDayIn(instant, "Not/AZone")).toEqual({ month: 3, day: 1 })
  })
})

describe("completedYears", () => {
  const joinedAt = new Date("2023-03-10T00:00:00Z")

  it("counts full years, changing on the anniversary day", () => {
    expect(completedYears(joinedAt, new Date("2026-03-09T12:00:00Z"), "UTC")).toBe(2)
    expect(completedYears(joinedAt, new Date("2026-03-10T12:00:00Z"), "UTC")).toBe(3)
  })

  it("uses the organization's calendar day for the anniversary", () => {
    // 02:00 UTC on 10 March is still 9 March in Lima.
    expect(completedYears(joinedAt, new Date("2026-03-10T02:00:00Z"), "America/Lima")).toBe(2)
    expect(completedYears(joinedAt, new Date("2026-03-10T02:00:00Z"), "UTC")).toBe(3)
  })

  it("is zero for someone who joined today", () => {
    expect(completedYears(new Date("2026-11-02T00:00:00Z"), new Date("2026-11-02T15:00:00Z"), "UTC")).toBe(0)
  })
})
