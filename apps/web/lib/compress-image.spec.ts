jest.mock("browser-image-compression", () => jest.fn())

import { compressionPlan } from "./compress-image"

describe("compressionPlan", () => {
  it.each([
    ["photo.jpg", "image/jpeg"],
    ["shot.png", "image/png"],
    ["pic.webp", "image/webp"],
  ])("recompresses %s keeping its type and name", (name, type) => {
    expect(compressionPlan({ name, type })).toEqual({ name })
  })

  it("leaves a GIF alone so it keeps its animation", () => {
    expect(compressionPlan({ name: "loop.gif", type: "image/gif" })).toBeNull()
  })

  it("leaves an AVIF alone", () => {
    expect(compressionPlan({ name: "a.avif", type: "image/avif" })).toBeNull()
  })

  it("turns a BMP into a PNG with a matching name", () => {
    expect(compressionPlan({ name: "scan.bmp", type: "image/bmp" })).toEqual({
      fileType: "image/png",
      name: "scan.png",
    })
    expect(compressionPlan({ name: "scan", type: "image/x-ms-bmp" })).toEqual({
      fileType: "image/png",
      name: "scan.png",
    })
  })

  it("uses the extension when the browser sends no type", () => {
    expect(compressionPlan({ name: "photo.JPG", type: "" })).toEqual({
      name: "photo.JPG",
    })
  })

  it("does not touch files that are not body images", () => {
    expect(compressionPlan({ name: "a.heic", type: "image/heic" })).toBeNull()
    expect(compressionPlan({ name: "a.svg", type: "image/svg+xml" })).toBeNull()
    expect(
      compressionPlan({ name: "a.pdf", type: "application/pdf" })
    ).toBeNull()
  })
})
