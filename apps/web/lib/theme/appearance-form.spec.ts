import { readFileSync } from "fs"
import { join } from "path"
import {
  BASE,
  EMPTY_SEEDS,
  GLASS_LEVELS,
  GLASS_TEXT_TOKENS,
  deriveTheme,
  glassLevel,
  readBlock,
} from "@cluster/theme"

import {
  contrastRows,
  glassPreviewVars,
  isDirty,
  isGlassDirty,
  previewVars,
  toPayload,
} from "./appearance-form"

const seeds = (over: object = {}) => ({ ...EMPTY_SEEDS, ...over })

describe("toPayload", () => {
  it("turns empty strings into null and normalises the hex", () => {
    expect(
      toPayload(seeds({ brandPrimary: "4C33E1", brandSecondary: "" }))
    ).toEqual(seeds({ brandPrimary: "#4c33e1" }))
  })

  it("drops the secondary when there is no primary (colours are one block)", () => {
    expect(
      toPayload(seeds({ brandPrimary: "", brandSecondary: "#b45309" }))
    ).toEqual(EMPTY_SEEDS)
  })

  it("keeps font and radius", () => {
    expect(toPayload(seeds({ fontKey: "geist", radiusKey: "round" }))).toEqual(
      seeds({ fontKey: "geist", radiusKey: "round" })
    )
  })
})

describe("isDirty", () => {
  const saved = seeds({ brandPrimary: "#4c33e1", fontKey: "inter" })

  it("is false for equal seeds, also when only the hex case differs", () => {
    expect(isDirty(saved, { ...saved })).toBe(false)
    expect(isDirty(saved, { ...saved, brandPrimary: "#4C33E1" })).toBe(false)
  })

  it("is true for any field change", () => {
    expect(isDirty(saved, { ...saved, brandPrimary: "#0f766e" })).toBe(true)
    expect(isDirty(saved, { ...saved, brandSecondary: "#b45309" })).toBe(true)
    expect(isDirty(saved, { ...saved, fontKey: "geist" })).toBe(true)
    expect(isDirty(saved, { ...saved, radiusKey: "sharp" })).toBe(true)
  })

  it("is true while a colour is being typed", () => {
    expect(isDirty(saved, { ...saved, brandPrimary: "#4c3" })).toBe(true)
  })
})

describe("previewVars", () => {
  const teal = seeds({ brandPrimary: "#0f766e", radiusKey: "round" })

  it("takes the brand tokens from deriveTheme", () => {
    const derived = deriveTheme({ primary: "#0f766e" })
    expect(previewVars(teal, "dark")["--primary"]).toBe(derived.dark.primary)
    expect(previewVars(teal, "light")["--primary"]).toBe(derived.light.primary)
  })

  it("falls back to the defaults, so the saved app theme never leaks in", () => {
    const vars = previewVars(EMPTY_SEEDS, "light")
    expect(vars["--primary"]).toBe(BASE.light.primary)
    expect(vars["--radius"]).toBe("0.625rem")
  })

  it("sets the radius and keeps unrelated tokens out", () => {
    const vars = previewVars(teal, "light")
    expect(vars["--radius"]).toBe("1rem")
    expect(vars["--success"]).toBeUndefined()
    expect(vars["--cat-2"]).toBeUndefined()
    expect(vars["--destructive"]).toBeUndefined()
  })

  // The light card must stay light inside a dark app (and the reverse): neutrals come from globals.css.
  it.each(["light", "dark"] as const)(
    "%s neutrals match globals.css",
    (theme) => {
      const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
      const light = readBlock(css, ":root")
      const actual =
        theme === "light" ? light : { ...light, ...readBlock(css, ".dark") }
      for (const [name, value] of Object.entries(
        previewVars(EMPTY_SEEDS, theme)
      )) {
        expect([name, value]).toEqual([name, actual[name.slice(2)]])
      }
    }
  )
})

describe("contrastRows", () => {
  it("checks every pair a brand seed touches, with the adjusted yellow passing", () => {
    const rows = contrastRows(seeds({ brandPrimary: "#ffd400" }), "light")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.pass)).toBe(true)
    expect(rows.some((r) => r.fg === "primary" && r.bg === "background")).toBe(
      true
    )
    expect(rows.some((r) => r.fg === "success-text")).toBe(false)
  })
})

describe("glassPreviewVars", () => {
  it.each(["light", "dark"] as const)(
    "%s: Off is solid, unfiltered and untinted",
    (theme) => {
      expect(glassPreviewVars(null, seeds(), theme)).toEqual({
        "--glass-alpha": "1",
        "--glass-filter": "none",
        "--glass-tint": "0",
      })
    }
  )

  it.each(["subtle", "medium", "strong"] as const)(
    "%s: follows the level table for the default brand",
    (key) => {
      for (const theme of ["light", "dark"] as const) {
        const level = GLASS_LEVELS[key][theme]
        expect(glassPreviewVars(key, seeds(), theme)).toEqual({
          "--glass-alpha": String(level.alpha),
          "--glass-filter": `blur(${level.blur}px) saturate(${level.saturate}%)`,
          "--glass-tint": String(level.tint),
          "--muted-foreground": GLASS_TEXT_TOKENS[theme],
        })
      }
    }
  )

  it("uses the opacity the brand colour needs, like the app will", () => {
    const brand = seeds({ brandPrimary: "#be185d" })
    const primary = deriveTheme({ primary: "#be185d", secondary: null }).light
      .primary
    expect(glassPreviewVars("strong", brand, "light")["--glass-alpha"]).toBe(
      String(glassLevel("strong", "light", primary).alpha)
    )
  })
})

describe("isDirty with glass", () => {
  it("compares the level, treating undefined as not shown", () => {
    expect(isGlassDirty("medium", "medium")).toBe(false)
    expect(isGlassDirty(null, "strong")).toBe(true)
    expect(isGlassDirty("subtle", null)).toBe(true)
    expect(isGlassDirty(undefined, null)).toBe(false)
  })
})
