import { BASE } from "./base"
import { PRESETS } from "./catalog"
import { PAIRS, pairRatio, ratio, type Theme } from "./contrast"
import { DERIVED_TOKENS, deriveTheme, fallBack } from "./derive"
import { hexToOklch, oklchToHex } from "./oklch"

const affected = PAIRS.filter((pair) =>
  [pair.fg, pair.bg, pair.base].some(
    (token) => token !== undefined && DERIVED_TOKENS.includes(token)
  )
)

const grid = [
  ...Array.from({ length: 24 }, (_, i) => i * 15).flatMap((h) =>
    [0.25, 0.5, 0.75].flatMap((l) =>
      [0.04, 0.15].map((c) => oklchToHex({ l, c, h }))
    )
  ),
  "#000000",
  "#ffffff",
  "#808080",
  "#ffd400",
  "#00ff00",
  "#0000ff",
]
const SECONDARIES = ["#ffcc00", "#e07020", "#00ff00", "#1f2a44", "#808080"]
// Every seed alone, and again with a secondary seed (it tints `secondary`).
const cases: [string, string | null][] = [
  ...grid.map((seed): [string, null] => [seed, null]),
  ...grid.map((seed, i): [string, string] => [
    seed,
    SECONDARIES[i % SECONDARIES.length],
  ]),
]

const label = ({ fg, bg, alpha, base }: (typeof PAIRS)[number]) =>
  `${fg}/${bg}${alpha ? `@${alpha}` : ""}${base ? ` over ${base}` : ""}`

describe("deriveTheme", () => {
  it("checks every pair that touches a derived token", () => {
    expect(affected.map(label).sort()).toEqual(
      [
        "primary-foreground/primary",
        "primary-foreground/primary@0.8 over background",
        "primary-foreground/primary@0.8 over card",
        "primary/background",
        "secondary-foreground/secondary",
        "sidebar-primary-foreground/sidebar-primary",
        "cat-1/background",
      ].sort()
    )
  })

  it("returns only the derived tokens", () => {
    const derived = deriveTheme({ primary: "#ffd400" })
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(Object.keys(derived[theme]).sort()).toEqual(
        [...DERIVED_TOKENS].sort()
      )
    }
  })

  describe.each(["light", "dark"] as Theme[])("%s theme", (theme) => {
    it.each(cases)(
      "%s (secondary %s) passes every affected pair",
      (seed, secondary) => {
        const derived = deriveTheme({ primary: seed, secondary })
        const tokens = { ...BASE[theme], ...derived[theme] }
        const failing = affected
          .map((pair) => ({
            pair: label(pair),
            ratio: pairRatio(tokens, pair),
          }))
          .filter((pair, i) => pair.ratio < affected[i].min)
        expect(failing).toEqual([])
        // The pairs pass by derivation, not by falling back to the default.
        expect(derived[theme].primary).not.toBe(BASE[theme].primary)
        if (secondary && hexToOklch(secondary).c > 0.02) {
          expect(derived[theme].secondary).not.toBe(BASE[theme].secondary)
        }
      }
    )
  })

  it("puts a failing token back to its default", () => {
    const tokens = fallBack("light", {
      primary: "#ffd400",
      "primary-foreground": "#ffffff",
      secondary: "#ffffff",
      "secondary-foreground": "#171717",
    })
    expect(tokens).toEqual({
      primary: BASE.light.primary,
      "primary-foreground": BASE.light["primary-foreground"],
      secondary: "#ffffff",
      "secondary-foreground": "#171717",
    })
  })

  it("reverts the followers with primary and leaves its input alone", () => {
    const input = {
      primary: "#ffd400",
      "primary-foreground": "#171717",
      "sidebar-primary": "#ffd400",
      "sidebar-primary-foreground": "#171717",
      "cat-1": "#ffd400",
    }
    const copy = { ...input }
    const tokens = fallBack("light", input)
    expect(input).toEqual(copy)
    expect(tokens).toEqual(
      Object.fromEntries(Object.keys(input).map((t) => [t, BASE.light[t]]))
    )
  })

  // A seed that has to move aims at a lowered pair's goal (4.5), not just its floor.
  it.each([
    ["#ffd400", "light"],
    ["#1f2a44", "dark"],
  ] as [string, Theme][])(
    "moves %s in %s to every pair's goal",
    (seed, theme) => {
      const tokens = {
        ...BASE[theme],
        ...deriveTheme({ primary: seed })[theme],
      }
      expect(tokens.primary).not.toBe(seed)
      const short = affected
        .filter((pair) => pairRatio(tokens, pair) < (pair.goal ?? pair.min))
        .map(label)
      expect(short).toEqual([])
    }
  )

  it("keeps a seed that already passes, as typed", () => {
    const derived = deriveTheme({ primary: "#5e47e8" })
    expect(derived.adjusted).toBeNull()
    expect(derived.light.primary).toBe("#5e47e8")
  })

  it("adjusts a light seed that disappears on white and says from what to what", () => {
    const { adjusted } = deriveTheme({ primary: "#ffd400" })
    expect(adjusted?.from).toBe("#ffd400")
    expect(ratio(adjusted!.to, "#ffffff")).toBeGreaterThanOrEqual(3)
  })

  it("keeps bright saturated seeds like yellow and cyan in dark mode with dark foreground", () => {
    for (const hex of ["#eab308", "#0ea5e9", "#22c55e"]) {
      const derived = deriveTheme({ primary: hex })
      expect(derived.dark.primary).toBe(hex)
      expect(ratio(derived.dark["primary-foreground"], hex)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps presets identical in light and dark mode with light foreground", () => {
    for (const { hex } of PRESETS) {
      const derived = deriveTheme({ primary: hex })
      expect(derived.adjusted).toBeNull()
      expect(derived.light.primary).toBe(hex)
      expect(derived.dark.primary).toBe(hex)
      expect(derived.dark["primary-foreground"]).toBe(derived.light["primary-foreground"])
    }
  })

  // Loose bound: the gamut clip shifts the hue of saturated seeds (shortcut in derive.ts).
  // Yellow darkened to the 4.5 hover goal (l 0.44) turns about 21° towards amber.
  it("keeps the hue family of the seed", () => {
    const seed = hexToOklch("#ffd400")
    const light = hexToOklch(deriveTheme({ primary: "#ffd400" }).light.primary)
    expect(Math.abs(light.h - seed.h)).toBeLessThan(25)
  })

  it.each(PRESETS)("preset $name derives with no adjustment", ({ hex }) => {
    expect(deriveTheme({ primary: hex }).adjusted).toBeNull()
  })

  it("takes the hue of secondary from the secondary seed only", () => {
    const plain = deriveTheme({ primary: "#4c33e1" })
    const tinted = deriveTheme({ primary: "#4c33e1", secondary: "#e07020" })
    expect(tinted.light.primary).toBe(plain.light.primary)
    expect(tinted.dark.primary).toBe(plain.dark.primary)
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(tinted[theme].secondary).not.toBe(plain[theme].secondary)
      const hue = hexToOklch(tinted[theme].secondary).h
      expect(Math.abs(hue - hexToOklch("#e07020").h)).toBeLessThan(
        Math.abs(hue - hexToOklch("#4c33e1").h)
      )
    }
  })
})
