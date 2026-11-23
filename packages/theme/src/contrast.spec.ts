import { readFileSync } from "fs"
import { join } from "path"

import { PAIRS, pairRatio, ratio, resolve } from "./contrast"
import { readBlock } from "./css-tokens"

const css = readFileSync(
  join(__dirname, "../../../apps/web/app/globals.css"),
  "utf8"
)
const light = readBlock(css, ":root")
const themes = { light, dark: { ...light, ...readBlock(css, ".dark") } }

describe("contrast helpers", () => {
  it("computes the WCAG ratio", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 2)
  })

  it("composites a translucent background over its base", () => {
    expect(ratio("#000000", "#ffffff00", "#000000")).toBeCloseTo(1, 5)
  })

  it("follows var() references", () => {
    expect(resolve({ a: "var(--b)", b: "#ffffff" }, "a")).toBe("#ffffff")
  })

  it("checks the brand surface against the page background", () => {
    expect(PAIRS).toContainEqual({
      fg: "primary",
      bg: "background",
      min: 1.8,
      goal: 3,
    })
  })

  it("composites a pair's bg at its alpha over the base before measuring", () => {
    const tokens = { ink: "#000000", fill: "#000000", page: "#ffffff" }
    const pair = { fg: "ink", bg: "fill", base: "page", min: 1 }
    expect(pairRatio(tokens, { ...pair, alpha: 0 })).toBeCloseTo(21, 1)
    expect(pairRatio(tokens, { ...pair, alpha: 1 })).toBeCloseTo(1, 5)
    expect(pairRatio(tokens, pair)).toBeCloseTo(1, 5)
  })

  it("checks the hover fill of primary buttons", () => {
    const pairs = PAIRS.map(({ fg, bg, base, alpha }) => ({
      fg,
      bg,
      base,
      alpha,
    }))
    for (const base of ["background", "card"]) {
      expect(pairs).toContainEqual({
        fg: "primary-foreground",
        bg: "primary",
        base,
        alpha: 0.8,
      })
    }
  })
})

describe.each(Object.entries(themes))("%s theme", (_, tokens) => {
  it.each(
    PAIRS.map(
      (pair) =>
        [
          `${pair.fg} on ${pair.bg}${pair.alpha ? `/${Math.round(pair.alpha * 100)}` : ""}${pair.base ? ` over ${pair.base}` : ""} ≥ ${pair.min}`,
          pair,
        ] as const
    )
  )("%s", (_, pair) => {
    expect(pairRatio(tokens, pair)).toBeGreaterThanOrEqual(pair.min)
  })
})
