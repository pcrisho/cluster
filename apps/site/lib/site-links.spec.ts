import { parseHttpsUrl } from "./site-links"

describe("parseHttpsUrl", () => {
  it("keeps an https URL", () => {
    expect(parseHttpsUrl(" https://github.com/acme/cluster ")).toBe(
      "https://github.com/acme/cluster"
    )
  })

  it.each([
    undefined,
    null,
    "",
    "   ",
    "http://github.com/x",
    "javascript:alert(1)",
    "not a url",
  ])("drops %p", (raw) => {
    expect(parseHttpsUrl(raw)).toBeNull()
  })
})
