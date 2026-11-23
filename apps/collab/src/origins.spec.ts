import { isAllowedOrigin } from "./origins"

const allowed = ["http://localhost:3000", "https://app.test"]

describe("isAllowedOrigin", () => {
  it("accepts an exact match", () => {
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true)
  })

  it("rejects an origin that is not listed", () => {
    expect(isAllowedOrigin("http://evil.test", allowed)).toBe(false)
    expect(isAllowedOrigin("http://localhost:3001", allowed)).toBe(false)
  })

  it("ignores a trailing slash on either side", () => {
    expect(isAllowedOrigin("http://localhost:3000/", allowed)).toBe(true)
    expect(isAllowedOrigin("https://app.test", ["https://app.test/"])).toBe(
      true
    )
  })

  it("rejects a missing or empty origin", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(false)
    expect(isAllowedOrigin("", allowed)).toBe(false)
  })
})
