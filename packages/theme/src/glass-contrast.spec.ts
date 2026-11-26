import { readFileSync } from "fs"
import { join } from "path"

import { PRESETS } from "./catalog"
import { ratio, resolve } from "./contrast"
import { readBlock } from "./css-tokens"
import { deriveTheme } from "./derive"
import {
  GLASS_BASE,
  GLASS_CHECKS,
  backdropAt,
  primaryAlpha,
  requiredAlpha,
  surfaceOver,
  tintCap,
} from "./glass-contrast"
import {
  GLASS_BACKDROP_T,
  GLASS_KEYS,
  GLASS_LEVELS,
  GLASS_TEXT_TOKENS,
  glassLevel,
} from "./glass"

const css = readFileSync(
  join(__dirname, "../../../apps/web/app/globals.css"),
  "utf8"
)
const light = readBlock(css, ":root")
const themes = { light, dark: { ...light, ...readBlock(css, ".dark") } }
const THEMES = ["light", "dark"] as const

// Brand colours the derivation can end up with, including the extremes.
const HEXES = [
  ...PRESETS.map((p) => p.hex),
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffd400",
  "#7f7f7f",
  "#8b7bff",
  "#101010",
]
const primariesOf = (hex: string) => {
  const { light, dark } = deriveTheme({ primary: hex, secondary: null })
  return { light: light.primary, dark: dark.primary }
}

describe("glass surface constants", () => {
  it.each(THEMES)("%s: match globals.css", (theme) => {
    const tokens = themes[theme]
    for (const [name, token] of [
      ["popover", "popover"],
      ["foreground", "foreground"],
      ["mutedForeground", "muted-foreground"],
      ["background", "background"],
    ] as const) {
      expect(GLASS_BASE[theme][name]).toBe(resolve(tokens, token))
    }
  })
})

describe("backdrops", () => {
  it.each(THEMES)("%s: runs from the worst backdrop to a mid tone", (theme) => {
    expect(backdropAt(theme, 0)).toBe(theme === "light" ? "#000000" : "#ffffff")
    expect(backdropAt(theme, 1)).toMatch(/^#[0-9a-f]{6}$/)
    expect(backdropAt(theme, 0)).not.toBe(backdropAt(theme, 1))
  })

  it("composites a surface over a backdrop", () => {
    expect(surfaceOver("#ffffff", "#000000", 1)).toBe("#ffffff")
    expect(surfaceOver("#ffffff", "#000000", 0)).toBe("#000000")
    expect(surfaceOver("#ffffff", "#000000", 0.5)).toBe("#808080")
  })
})

describe("requiredAlpha", () => {
  it("is 1 when a text colour cannot reach its floor on any translucency", () => {
    // Pale text on a white surface never passes.
    expect(requiredAlpha(themes.light, "light", 0, "#f0f0f0")).toBe(1)
  })

  it("asks for less opacity on a milder backdrop", () => {
    for (const theme of THEMES) {
      const text = GLASS_TEXT_TOKENS[theme]
      const worst = requiredAlpha(themes[theme], theme, 0, text)
      const mid = requiredAlpha(themes[theme], theme, 1, text)
      expect(mid).toBeLessThan(worst)
    }
  })

  it("checks the focus ring and the status text, not only the body text", () => {
    const names = GLASS_CHECKS.map((c) => (c.on ? `${c.fg} on ${c.on}` : c.fg))
    expect(names).toEqual(
      expect.arrayContaining([
        "foreground",
        "popover-foreground",
        "glass-muted-foreground",
        "destructive",
        "ring",
        "danger-text",
        "danger-text on danger-subtle",
      ])
    )
  })
})

describe.each(THEMES)("%s theme: the levels keep their promise", (theme) => {
  it.each(GLASS_KEYS)("%s covers every text colour on its backdrop", (key) => {
    const need = requiredAlpha(
      themes[theme],
      theme,
      GLASS_BACKDROP_T[key],
      GLASS_TEXT_TOKENS[theme]
    )
    expect(GLASS_LEVELS[key][theme].alpha).toBeGreaterThanOrEqual(need)
  })

  it.each(GLASS_KEYS)(
    "%s leaves the ambient tint readable on the default brand",
    (key) => {
      const primary = themes[theme].primary
      expect(tintCap(primary, theme)).toBeGreaterThanOrEqual(
        GLASS_LEVELS[key][theme].tint
      )
    }
  )

  it("the reinforced secondary text beats the current one", () => {
    const { background } = GLASS_BASE[theme]
    expect(ratio(GLASS_TEXT_TOKENS[theme], background)).toBeGreaterThan(
      ratio(resolve(themes[theme], "muted-foreground"), background)
    )
  })
})

describe.each(THEMES)("%s theme: any brand colour", (theme) => {
  it.each(GLASS_KEYS)("%s stays readable for every sample brand", (key) => {
    for (const hex of HEXES) {
      const primary = primariesOf(hex)[theme]
      const level = glassLevel(key, theme, primary)
      const base = GLASS_LEVELS[key][theme]
      expect(level.alpha).toBeGreaterThanOrEqual(base.alpha)
      expect(level.alpha).toBeLessThanOrEqual(1)
      expect(level.tint).toBeLessThanOrEqual(base.tint)

      // The brand text on the surface at the adjusted opacity (in dark mode, solid brand fills
      // may use dark-on-light contrast instead of 4.5:1 text over dark popover).
      const surface = surfaceOver(
        GLASS_BASE[theme].popover,
        backdropAt(theme, GLASS_BACKDROP_T[key]),
        level.alpha
      )
      if (
        level.alpha < 1 &&
        ratio(primary, GLASS_BASE[theme].popover) >= 4.5
      ) {
        expect(ratio(primary, surface)).toBeGreaterThanOrEqual(4.5)
      }
      // The ambient tint under the page text.
      const page = surfaceOver(
        GLASS_BASE[theme].background,
        primary,
        1 - level.tint
      )
      expect(ratio(GLASS_BASE[theme].foreground, page)).toBeGreaterThanOrEqual(
        4.5
      )
      expect(
        ratio(GLASS_BASE[theme].mutedForeground, page)
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("leaves the default brand and the presets at their level", () => {
    for (const key of GLASS_KEYS) {
      for (const hex of PRESETS.map((p) => p.hex)) {
        const level = glassLevel(key, theme, primariesOf(hex)[theme])
        expect(
          level.alpha - GLASS_LEVELS[key][theme].alpha
        ).toBeLessThanOrEqual(0.06)
      }
      if (theme === "light") {
        expect(
          primaryAlpha(
            primariesOf(PRESETS[0].hex)[theme],
            theme,
            GLASS_BACKDROP_T[key]
          )
        ).toBeLessThanOrEqual(GLASS_LEVELS[key][theme].alpha)
      }
    }
  })
})

// Mutation guard: a level one step (0.01) below what the contract needs for the default brand
// must be rejected, so lowering a number in GLASS_LEVELS cannot go unnoticed.
describe.each(THEMES)("%s theme: the levels are the contract's floor", (theme) => {
  it.each(GLASS_KEYS)("%s is not looser than needed", (key) => {
    const t = GLASS_BACKDROP_T[key]
    const brandNeed = primaryAlpha(primariesOf(PRESETS[0].hex)[theme], theme, t)
    const need = Math.max(
      requiredAlpha(themes[theme], theme, t, GLASS_TEXT_TOKENS[theme]),
      brandNeed < 1 ? brandNeed : 0
    )
    const { alpha } = GLASS_LEVELS[key][theme]
    expect(alpha - 0.01).toBeLessThan(need)
    expect(alpha).toBeGreaterThanOrEqual(need)
  })
})
