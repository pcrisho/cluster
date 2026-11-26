import {
  FONT_KEYS,
  FONT_LABELS,
  PRESETS,
  RADIUS_KEYS,
  RADIUS_REM,
} from "./catalog"

describe("catalog", () => {
  it("lists the six fonts with Inter first", () => {
    expect(FONT_KEYS).toEqual([
      "inter",
      "geist",
      "source-sans-3",
      "ibm-plex-sans",
      "dm-sans",
      "nunito-sans",
    ])
    expect(Object.keys(FONT_LABELS)).toEqual([...FONT_KEYS])
  })

  it("maps the radius keys to rem", () => {
    expect(RADIUS_KEYS).toEqual(["sharp", "default", "round"])
    expect(RADIUS_REM).toEqual({ sharp: 0.25, default: 0.625, round: 1 })
  })

  it("starts the presets with the default indigo", () => {
    expect(PRESETS[0].hex).toBe("#5e47e8")
    expect(PRESETS.length).toBeGreaterThanOrEqual(6)
    expect(PRESETS.length).toBeLessThanOrEqual(8)
    for (const { hex } of PRESETS) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
