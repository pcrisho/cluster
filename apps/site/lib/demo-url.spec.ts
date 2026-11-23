import { parseDemoUrl, getDemoUrl } from "./demo-url"

describe("parseDemoUrl", () => {
  it("returns null for empty or undefined values", () => {
    expect(parseDemoUrl(undefined)).toBeNull()
    expect(parseDemoUrl(null)).toBeNull()
    expect(parseDemoUrl("")).toBeNull()
    expect(parseDemoUrl("   ")).toBeNull()
  })

  it("accepts valid mailto: URLs", () => {
    expect(parseDemoUrl("mailto:demo@cluster.com")).toBe(
      "mailto:demo@cluster.com"
    )
    expect(parseDemoUrl("  mailto:hello@example.org  ")).toBe(
      "mailto:hello@example.org"
    )
  })

  it("rejects invalid mailto: URLs", () => {
    expect(parseDemoUrl("mailto:")).toBeNull()
    expect(parseDemoUrl("mailto: hello")).toBeNull()
  })

  it("accepts valid https: URLs", () => {
    expect(parseDemoUrl("https://cal.com/cluster/demo")).toBe(
      "https://cal.com/cluster/demo"
    )
    expect(parseDemoUrl("  https://cluster.app/demo/  ")).toBe(
      "https://cluster.app/demo/"
    )
  })

  it("rejects http, javascript, relative and invalid protocols", () => {
    expect(parseDemoUrl("http://cal.com/demo")).toBeNull()
    expect(parseDemoUrl("javascript:alert(1)")).toBeNull()
    expect(parseDemoUrl("/register")).toBeNull()
    expect(parseDemoUrl("#contact")).toBeNull()
    expect(parseDemoUrl("ftp://example.com")).toBeNull()
    expect(parseDemoUrl("https://")).toBeNull()
  })

  it("reads from process.env.NEXT_PUBLIC_DEMO_URL in getDemoUrl()", () => {
    const original = process.env.NEXT_PUBLIC_DEMO_URL
    try {
      process.env.NEXT_PUBLIC_DEMO_URL = "https://example.com/demo"
      expect(getDemoUrl()).toBe("https://example.com/demo")
      process.env.NEXT_PUBLIC_DEMO_URL = "invalid"
      expect(getDemoUrl()).toBeNull()
      delete process.env.NEXT_PUBLIC_DEMO_URL
      expect(getDemoUrl()).toBeNull()
    } finally {
      process.env.NEXT_PUBLIC_DEMO_URL = original
    }
  })
})
