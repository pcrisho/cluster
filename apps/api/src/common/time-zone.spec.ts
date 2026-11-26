import { isIanaTimeZone } from "./time-zone"

describe("isIanaTimeZone", () => {
  it("accepts canonical zones and UTC", () => {
    for (const zone of ["America/Lima", "America/Mexico_City", "Europe/Madrid", "Asia/Tokyo", "UTC"]) {
      expect(isIanaTimeZone(zone)).toBe(true)
    }
  })

  it("rejects offsets, abbreviations, other spellings and garbage", () => {
    for (const zone of ["+05:00", "UTC+5", "EST", "GMT", "america/lima", "Mars/Olympus", "", " America/Lima"]) {
      expect(isIanaTimeZone(zone)).toBe(false)
    }
    expect(isIanaTimeZone(null)).toBe(false)
    expect(isIanaTimeZone(5)).toBe(false)
  })
})
