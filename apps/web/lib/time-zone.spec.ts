import { timeZoneGroups, timeZoneLabel, utcOffset } from "./time-zone"

describe("time zones", () => {
  const january = new Date("2026-01-15T12:00:00Z")
  const july = new Date("2026-07-15T12:00:00Z")

  it("shows the offset in force on that date", () => {
    expect(utcOffset("America/Lima", january)).toBe("UTC−05:00")
    expect(utcOffset("America/Santiago", january)).toBe("UTC−03:00")
    expect(utcOffset("America/Santiago", july)).toBe("UTC−04:00")
    expect(utcOffset("Asia/Kolkata", july)).toBe("UTC+05:30")
    expect(utcOffset("UTC", july)).toBe("UTC+00:00")
  })

  it("names a zone by its place", () => {
    expect(timeZoneLabel("America/Lima", january)).toBe("(UTC−05:00) Lima")
    expect(timeZoneLabel("America/Argentina/Buenos_Aires", january)).toBe(
      "(UTC−03:00) Argentina / Buenos Aires"
    )
    expect(timeZoneLabel("UTC", january)).toBe("(UTC+00:00) UTC")
  })

  it("groups every zone by region, UTC first, without Etc", () => {
    const groups = timeZoneGroups()
    expect(groups[0]).toEqual({ value: "UTC", items: ["UTC"] })
    const america = groups.find((g) => g.value === "America")!
    expect(america.items).toContain("America/Lima")
    expect(groups.some((g) => g.value === "Etc")).toBe(false)
  })
})
