import { effectiveLocale, isLocale } from "./locale"

describe("locale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("es")).toBe(true)
    expect(isLocale("fr")).toBe(false)
    expect(isLocale("ES")).toBe(false)
    expect(isLocale(null)).toBe(false)
  })

  it("uses the person's choice, then the instance default, then English", () => {
    expect(effectiveLocale("es", "en")).toBe("es")
    expect(effectiveLocale(null, "es")).toBe("es")
    expect(effectiveLocale(undefined, undefined)).toBe("en")
  })

  it("takes the first supported value of any number of fallbacks", () => {
    expect(effectiveLocale(null, "es", "en")).toBe("es")
    expect(effectiveLocale(null, null, "es")).toBe("es")
    expect(effectiveLocale("en", "es", "es")).toBe("en")
    expect(effectiveLocale(null, undefined, "fr")).toBe("en")
  })

  it("falls through a value that is no longer supported", () => {
    expect(effectiveLocale("fr", "es")).toBe("es")
    expect(effectiveLocale("fr", "de")).toBe("en")
  })
})
