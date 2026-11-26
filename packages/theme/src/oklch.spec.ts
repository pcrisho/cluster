import { hexToOklch, oklchToHex } from "./oklch"

describe("oklch", () => {
  it("maps white and black to the ends of lightness", () => {
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 4)
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 4)
  })

  it("matches the CSS Color 4 value of sRGB red", () => {
    const red = hexToOklch("#ff0000")
    expect(red.l).toBeCloseTo(0.628, 3)
    expect(red.c).toBeCloseTo(0.2577, 3)
    expect(red.h).toBeCloseTo(29.23, 1)
  })

  it.each([
    "#4c33e1",
    "#ffd400",
    "#00ff00",
    "#0000ff",
    "#808080",
    "#0a0a0a",
    "#f5f5f5",
    "#8b7bff",
    "#b45309",
    "#123456",
  ])("round-trips %s", (hex) => {
    expect(oklchToHex(hexToOklch(hex))).toBe(hex)
  })

  it("clips out-of-gamut colours to a valid hex", () => {
    expect(oklchToHex({ l: 0.9, c: 0.4, h: 140 })).toMatch(/^#[0-9a-f]{6}$/)
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe("#000000")
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe("#ffffff")
  })
})
