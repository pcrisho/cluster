import { EMPTY_SEEDS, normalizeHex, parseSeeds } from "./seeds"

describe("normalizeHex", () => {
  it("accepts six digits with or without #, any case, trimmed", () => {
    expect(normalizeHex("4C33E1")).toBe("#4c33e1")
    expect(normalizeHex(" #4c33e1 ")).toBe("#4c33e1")
  })

  it("rejects anything else", () => {
    for (const bad of ["#fff", "#4c33e1ff", "red", "", "#4c33eg"]) {
      expect(normalizeHex(bad)).toBeNull()
    }
  })
})

describe("parseSeeds", () => {
  it("returns null for a non-object", () => {
    expect(parseSeeds("x")).toBeNull()
    expect(parseSeeds(null)).toBeNull()
    expect(parseSeeds([])).toBeNull()
  })

  it("reads valid fields and normalizes colours", () => {
    expect(
      parseSeeds({
        brandPrimary: "4C33E1",
        brandSecondary: "#00aa88",
        fontKey: "geist",
        radiusKey: "round",
      })
    ).toEqual({
      brandPrimary: "#4c33e1",
      brandSecondary: "#00aa88",
      fontKey: "geist",
      radiusKey: "round",
    })
  })

  it("turns each invalid field into null on its own", () => {
    expect(
      parseSeeds({ brandPrimary: "red;}body{display:none" })?.brandPrimary
    ).toBeNull()
    expect(parseSeeds({ fontKey: "comic-sans" })?.fontKey).toBeNull()
    expect(parseSeeds({ radiusKey: 3, fontKey: "inter" })).toEqual({
      ...EMPTY_SEEDS,
      fontKey: "inter",
    })
  })

  it("drops a secondary without a primary", () => {
    expect(parseSeeds({ brandSecondary: "#00aa88" })?.brandSecondary).toBeNull()
  })
})
