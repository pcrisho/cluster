import {
  GLASS_KEYS,
  GLASS_LEVELS,
  GLASS_TEXT_TOKENS,
  glassCss,
  parseGlass,
} from "./glass"
import { EMPTY_SEEDS, parseSeeds } from "./seeds"

describe("glass catalogue", () => {
  it("lists the three levels, Off being null", () => {
    expect(GLASS_KEYS).toEqual(["subtle", "medium", "strong"])
    expect(Object.keys(GLASS_LEVELS)).toEqual([...GLASS_KEYS])
  })

  it.each(["light", "dark"] as const)(
    "gets more glass with each level in the %s theme",
    (theme) => {
      const [subtle, medium, strong] = GLASS_KEYS.map(
        (key) => GLASS_LEVELS[key][theme]
      )
      expect(subtle.alpha).toBeGreaterThan(medium.alpha)
      expect(medium.alpha).toBeGreaterThan(strong.alpha)
      for (const more of ["blur", "saturate", "tint"] as const) {
        expect(subtle[more]).toBeLessThan(medium[more])
        expect(medium[more]).toBeLessThan(strong[more])
      }
    }
  )

  it.each(GLASS_KEYS)("keeps %s inside the spec limits", (key) => {
    for (const theme of ["light", "dark"] as const) {
      const { alpha, blur, saturate, tint } = GLASS_LEVELS[key][theme]
      expect(alpha).toBeGreaterThan(0.5)
      expect(alpha).toBeLessThan(1)
      expect(blur).toBeGreaterThan(0)
      expect(blur).toBeLessThanOrEqual(24)
      expect(saturate).toBeGreaterThanOrEqual(100)
      expect(tint).toBeGreaterThan(0)
      expect(tint).toBeLessThanOrEqual(0.12)
    }
  })

  it("reinforces the secondary text with a hex per theme", () => {
    expect(GLASS_TEXT_TOKENS.light).toMatch(/^#[0-9a-f]{6}$/)
    expect(GLASS_TEXT_TOKENS.dark).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe("parseGlass", () => {
  it.each(GLASS_KEYS)("accepts %s", (key) => {
    expect(parseGlass(key)).toBe(key)
  })

  it.each([
    null,
    undefined,
    "",
    "off",
    "neon",
    "Subtle",
    " medium",
    "strong; }",
    42,
    {},
    ["strong"],
  ])("reads %p as Off", (value) => {
    expect(parseGlass(value)).toBeNull()
  })
})

describe("glassCss", () => {
  it("is empty when glass is off", () => {
    expect(glassCss(null)).toBe("")
  })

  it.each(GLASS_KEYS)(
    "writes the light block, then the dark one, for %s",
    (key) => {
      const css = glassCss(key)
      const light = css.indexOf("html:root{")
      const dark = css.indexOf("html.dark{")
      expect(light).toBe(0)
      expect(dark).toBeGreaterThan(light)

      for (const [theme, at] of [
        ["light", light],
        ["dark", dark],
      ] as const) {
        const block = css.slice(at, css.indexOf("}", at))
        const level = GLASS_LEVELS[key][theme]
        expect(block).toContain(`--glass-alpha:${level.alpha};`)
        expect(block).toContain(`--glass-blur:${level.blur}px;`)
        expect(block).toContain(`--glass-saturate:${level.saturate}%;`)
        expect(block).toContain(`--glass-tint:${level.tint};`)
        expect(block).toContain(
          `--glass-muted-foreground:${GLASS_TEXT_TOKENS[theme]};`
        )
      }
    }
  )

  it("only writes custom properties, so nothing else can reach the page", () => {
    for (const key of GLASS_KEYS) {
      const body = glassCss(key).replace(/html(:root|\.dark)\{|\}/g, "")
      expect(body).toMatch(/^(--glass-[a-z-]+:[#\w.%]+;)+$/)
    }
  })
})

describe("glass and the seeds", () => {
  it("is not a seed: the organization layer never carries it", () => {
    expect(Object.keys(EMPTY_SEEDS)).not.toContain("glassKey")
    const parsed = parseSeeds({ brandPrimary: "#4c33e1", glassKey: "strong" })
    expect(parsed).not.toHaveProperty("glassKey")
  })
})
