import { glassOf, themeFromSources } from "./server"

const seeds = (over: object = {}) => ({
  theme: {
    brandPrimary: null,
    brandSecondary: null,
    fontKey: null,
    radiusKey: null,
    ...over,
  },
})
// The value as Next hands it over: already URL-decoded once.
const cookie = (value: unknown) => JSON.stringify(value)

describe("themeFromSources", () => {
  it("renders nothing for the default instance and no cookie", () => {
    expect(themeFromSources(seeds(), undefined)).toBe("")
    expect(themeFromSources(null, undefined)).toBe("")
    expect(themeFromSources({}, undefined)).toBe("")
  })

  it("applies the instance seeds", () => {
    const css = themeFromSources(seeds({ brandPrimary: "#1d4ed8" }), undefined)
    expect(css.startsWith("html:root{")).toBe(true)
    expect(css).toContain("html.dark{")
  })

  it("ignores hostile or corrupt instance fields one by one", () => {
    const css = themeFromSources(
      seeds({ brandPrimary: "red;}body{display:none", fontKey: "evil" }),
      undefined
    )
    expect(css).toBe("")
  })

  it.each([
    ["hostile colour", cookie({ p: "red;}body{display:none" })],
    ["hostile font", cookie({ f: "inter;}body{display:none" })],
    ["corrupt JSON", "{not-json"],
    ["bad escape", "%E0%A4%A"],
    ["still-encoded", encodeURIComponent(cookie({ p: "#0a6cff" }))],
    ["array", cookie([1, 2])],
    ["string", cookie("x")],
    ["null", cookie(null)],
  ])("a %s cookie behaves as no cookie", (_name, raw) => {
    const instance = seeds({ brandPrimary: "#1d4ed8", fontKey: "geist" })
    expect(themeFromSources(instance, raw)).toBe(
      themeFromSources(instance, undefined)
    )
    expect(themeFromSources(seeds(), raw)).toBe("")
  })

  it("lets a valid cookie colour win over the instance colour block", () => {
    const instance = seeds({ brandPrimary: "#1d4ed8" })
    const mine = themeFromSources(instance, cookie({ p: "#0a6cff" }))
    expect(mine).not.toBe(themeFromSources(instance, undefined))
    expect(mine).toBe(
      themeFromSources(seeds({ brandPrimary: "#0a6cff" }), undefined)
    )
  })

  it("inherits font and radius independently from the cookie", () => {
    const css = themeFromSources(
      seeds({ fontKey: "geist" }),
      cookie({ r: "round" })
    )
    expect(css).toContain("--radius:1rem")
    expect(css).toContain("--font-sans:var(--font-geist)")
  })

  it("never emits markup or quote characters", () => {
    const css = themeFromSources(
      seeds({
        brandPrimary: "#1d4ed8",
        fontKey: "dm-sans",
        radiusKey: "sharp",
      }),
      cookie({ p: "#0a6cff", s: "<script>", f: '"x"' })
    )
    expect(css).not.toMatch(/[<>"']/)
  })
})

describe("glass", () => {
  it("renders the instance's level after the theme", () => {
    const css = themeFromSources(
      seeds({ brandPrimary: "#1d4ed8", glassKey: "medium" }),
      undefined
    )
    expect(css.startsWith("html:root{")).toBe(true)
    expect(css).toContain("--glass-alpha:")
    expect(css.indexOf("--primary")).toBeLessThan(css.indexOf("--glass-alpha"))
  })

  it("renders only the glass variables for the default brand", () => {
    const css = themeFromSources(seeds({ glassKey: "subtle" }), undefined)
    expect(css.startsWith("html:root{--glass-alpha:")).toBe(true)
    expect(css).not.toContain("--primary")
  })

  it("ignores a glass level in the organization cookie", () => {
    const css = themeFromSources(
      seeds(),
      cookie({ p: "#0a6cff", g: "strong", glassKey: "strong" })
    )
    expect(css).not.toContain("--glass")
  })

  it("reads an unknown or hostile level as Off", () => {
    for (const glassKey of ["neon", "strong;}body{display:none", 3, {}]) {
      expect(themeFromSources(seeds({ glassKey }), undefined)).toBe("")
    }
  })

  it("glassOf gives the level to put on <html>, or null", () => {
    expect(glassOf(seeds({ glassKey: "strong" }))).toBe("strong")
    expect(glassOf(seeds())).toBeNull()
    expect(glassOf(seeds({ glassKey: "neon" }))).toBeNull()
    expect(glassOf(null)).toBeNull()
    expect(glassOf({})).toBeNull()
    expect(glassOf({ theme: "strong" })).toBeNull()
  })
})
