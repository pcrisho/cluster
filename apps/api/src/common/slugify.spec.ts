import { slugify } from "./slugify"

describe("slugify", () => {
  it("strips accents and lowercases names", () => {
    expect(slugify("Compañía")).toBe("compania")
    expect(slugify("Café Crème")).toBe("cafe-creme")
  })

  it("trims whitespace and collapses punctuation into single hyphens", () => {
    expect(slugify("  Hello,  World! ")).toBe("hello-world")
    expect(slugify("---foo___bar---")).toBe("foo-bar")
    expect(slugify("Acme & Co. / Labs")).toBe("acme-co-labs")
  })

  it("caps the output length at 63 characters", () => {
    const longInput = "a".repeat(100)
    const slug = slugify(longInput)
    expect(slug.length).toBeLessThanOrEqual(63)
    expect(slug).toBe("a".repeat(63))

    const longWords = `${"organization-".repeat(10)}end`
    expect(longWords.length).toBeGreaterThan(100)
    expect(slugify(longWords).length).toBeLessThanOrEqual(63)
  })

  it("returns an empty string for inputs containing only symbols or whitespace", () => {
    expect(slugify("!!!")).toBe("")
    expect(slugify("   ---   ")).toBe("")
  })
})
