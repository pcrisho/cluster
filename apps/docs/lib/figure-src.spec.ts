import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { darkSibling, darkVariant } from "./figure-src"

describe("darkVariant", () => {
  it("maps a light screenshot to its dark twin", () => {
    expect(darkVariant("/screenshots/know-spaces-en-light.png")).toBe("/screenshots/know-spaces-en-dark.png")
  })

  it("ignores anything that is not a light screenshot", () => {
    expect(darkVariant("/screenshots/know-spaces-en-dark.png")).toBeUndefined()
    expect(darkVariant("/images/logo-light.png")).toBeUndefined()
    expect(darkVariant("https://example.com/screenshots/a-light.png")).toBeUndefined()
  })
})

describe("darkSibling", () => {
  const pub = mkdtempSync(join(tmpdir(), "docs-public-"))
  mkdirSync(join(pub, "screenshots"))
  writeFileSync(join(pub, "screenshots", "a-en-dark.png"), "")

  it("returns the dark twin only when the file exists", () => {
    expect(darkSibling("/screenshots/a-en-light.png", pub)).toBe("/screenshots/a-en-dark.png")
    expect(darkSibling("/screenshots/b-en-light.png", pub)).toBeUndefined()
  })
})
