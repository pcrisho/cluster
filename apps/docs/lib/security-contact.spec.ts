import { parseSecurityContact } from "./security-contact"

describe("parseSecurityContact", () => {
  test("accepts mailto: and https: values", () => {
    expect(parseSecurityContact("mailto:security@example.com")).toEqual({
      href: "mailto:security@example.com",
      kind: "mailto",
      display: "security@example.com",
    })
    expect(parseSecurityContact("https://example.com/security")).toEqual({
      href: "https://example.com/security",
      kind: "https",
      display: "https://example.com/security",
    })
  })

  test("rejects unset, http:, and javascript: values", () => {
    expect(parseSecurityContact(undefined)).toBeNull()
    expect(parseSecurityContact("")).toBeNull()
    expect(parseSecurityContact("http://example.com/security")).toBeNull()
    expect(parseSecurityContact("javascript:alert(1)")).toBeNull()
  })
})
