import { mosaicLayout } from "./post-images-layout"

describe("mosaicLayout", () => {
  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 5],
    [10, 5],
  ])("shows %i photos as %i tiles at most", (count, visible) => {
    expect(mosaicLayout(count).visible).toBe(visible)
  })

  it("makes the first tile larger from three photos on, and only then", () => {
    expect(mosaicLayout(2).first).toBe("")
    expect(mosaicLayout(3).first).toContain("row-span-2")
    expect(mosaicLayout(5).first).toContain("col-span-2")
  })
})
