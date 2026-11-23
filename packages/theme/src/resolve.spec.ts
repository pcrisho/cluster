import { PRESETS } from "./catalog"
import { resolveSeeds, themeCss } from "./resolve"
import { EMPTY_SEEDS, type Seeds } from "./seeds"

const seeds = (patch: Partial<Seeds>): Seeds => ({ ...EMPTY_SEEDS, ...patch })
const SHAPE = /^html:root\{[^<>"']*\}(html\.dark\{[^<>"']*\})?$/

describe("resolveSeeds", () => {
  const instance = seeds({
    brandPrimary: "#4c33e1",
    brandSecondary: "#e07020",
    fontKey: "geist",
    radiusKey: "round",
  })

  it("uses the instance when there is no organization layer", () => {
    expect(resolveSeeds(instance, null)).toEqual(instance)
  })

  it("takes the colour block whole from the organization", () => {
    expect(
      resolveSeeds(instance, seeds({ brandPrimary: "#0f766e" }))
    ).toMatchObject({ brandPrimary: "#0f766e", brandSecondary: null })
  })

  it("keeps the instance colours when the organization sets none", () => {
    expect(
      resolveSeeds(instance, seeds({ brandSecondary: "#00aa88" }))
    ).toMatchObject({ brandPrimary: "#4c33e1", brandSecondary: "#e07020" })
  })

  it("inherits font and radius on their own", () => {
    expect(resolveSeeds(instance, seeds({ fontKey: "dm-sans" }))).toEqual({
      ...instance,
      fontKey: "dm-sans",
    })
    expect(resolveSeeds(instance, seeds({ radiusKey: "sharp" }))).toEqual({
      ...instance,
      radiusKey: "sharp",
    })
  })
})

describe("themeCss", () => {
  it("is empty for the default", () => {
    expect(themeCss(EMPTY_SEEDS)).toBe("")
  })

  it("emits only root for a font or radius", () => {
    expect(themeCss(seeds({ fontKey: "geist" }))).toBe(
      "html:root{--font-sans:var(--font-geist)}"
    )
    expect(themeCss(seeds({ radiusKey: "default" }))).toBe(
      "html:root{--radius:0.625rem}"
    )
  })

  it("emits light and dark colour tokens", () => {
    const css = themeCss(seeds({ brandPrimary: "#4c33e1", radiusKey: "round" }))
    expect(css).toMatch(SHAPE)
    expect(css).toContain("html:root{--primary:#4c33e1;")
    expect(css).toContain(";--radius:1rem}html.dark{--primary:#")
  })

  it.each(PRESETS)("is well formed for $name", ({ hex }) => {
    expect(themeCss(seeds({ brandPrimary: hex }))).toMatch(SHAPE)
  })
})

describe("themeCss with glass", () => {
  const brand = seeds({ brandPrimary: "#1d4ed8", fontKey: "geist" })

  it("stays empty when glass is Off, whatever the seeds", () => {
    expect(themeCss(EMPTY_SEEDS, null)).toBe("")
    expect(themeCss(brand, null)).toBe(themeCss(brand))
  })

  it("writes only the glass variables for the default brand", () => {
    const css = themeCss(EMPTY_SEEDS, "medium")
    expect(css.startsWith("html:root{--glass-alpha:")).toBe(true)
    expect(css).toContain("html.dark{--glass-alpha:")
    expect(css).not.toContain("--primary")
  })

  it("puts the glass blocks after the theme blocks", () => {
    const css = themeCss(brand, "strong")
    expect(css.startsWith(themeCss(brand))).toBe(true)
    expect(css.length).toBeGreaterThan(themeCss(brand).length)
    expect(css.slice(themeCss(brand).length)).toMatch(
      /^html:root\{--glass-alpha:[\d.]+;.*\}html\.dark\{--glass-alpha:[\d.]+;.*\}$/
    )
  })

  it("derives the brand once and keeps the glass contract with it", () => {
    // Pink needs more opacity than the table gives Strong in light (glass-contrast.spec.ts).
    const pink = PRESETS.find((p) => p.name === "Pink")!.hex
    const css = themeCss(seeds({ brandPrimary: pink }), "strong")
    const alpha = Number(
      /html:root\{--glass-alpha:([\d.]+);/.exec(
        css.slice(css.indexOf("--glass-alpha") - 10)
      )?.[1]
    )
    expect(alpha).toBeGreaterThanOrEqual(0.84)
  })

  it("is safe for any seed: only #rrggbb and catalogue keys reach it", () => {
    for (const key of ["subtle", "medium", "strong"] as const) {
      expect(themeCss(brand, key)).toMatch(/^[^<>"']*$/)
    }
  })
})
