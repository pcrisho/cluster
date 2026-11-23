import { bodyUploadKind, catalogType, uploadProblemCode } from "./file-types"

const MB = 1024 * 1024
const file = (name: string, type: string, size = 1000) => ({
  name,
  type,
  size,
})

describe("catalogType", () => {
  it("prefers the declared type", () => {
    expect(catalogType(file("photo.png", "image/jpeg"))?.mime).toBe(
      "image/jpeg"
    )
  })

  it("falls back to the extension when the browser sends no type", () => {
    expect(catalogType(file("report.pbix", ""))?.mime).toBe(
      "application/vnd.ms-powerbi"
    )
    expect(
      catalogType(file("Report.PBIT", "application/octet-stream"))?.label
    ).toBe("Power BI template")
  })

  it("is null for a type outside the catalog", () => {
    expect(catalogType(file("setup.exe", "application/x-msdownload"))).toBe(
      null
    )
  })
})

describe("bodyUploadKind", () => {
  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.webp", "image/webp"],
    ["a.gif", "image/gif"],
    ["a.bmp", "image/bmp"],
    ["a.avif", "image/avif"],
  ])("sends %s to the image upload", (name, type) => {
    expect(bodyUploadKind(file(name, type))).toBe("image")
  })

  it.each([
    ["IMG_0001.HEIC", "image/heic"],
    ["IMG_0001.heic", ""],
    ["logo.svg", "image/svg+xml"],
    ["a.pdf", "application/pdf"],
    ["a.tiff", "image/tiff"],
    ["a.exe", "application/x-msdownload"],
  ])("sends %s to the file-card upload", (name, type) => {
    expect(bodyUploadKind(file(name, type))).toBe("document")
  })
})

describe("uploadProblemCode", () => {
  it("accepts an inline image as an image and as a document", () => {
    expect(uploadProblemCode("image", file("a.gif", "image/gif"))).toBeNull()
    expect(uploadProblemCode("document", file("a.gif", "image/gif"))).toBeNull()
  })

  it("rejects a download-only image in the body", () => {
    expect(uploadProblemCode("image", file("a.heic", "image/heic"))).toBe(
      "IMAGE_TYPE_UNSUPPORTED"
    )
    expect(
      uploadProblemCode("document", file("a.heic", "image/heic"))
    ).toBeNull()
  })

  it("rejects an unknown type", () => {
    expect(uploadProblemCode("document", file("a.exe", ""))).toBe(
      "FILE_TYPE_UNSUPPORTED"
    )
  })

  it("rejects a file over its kind's limit", () => {
    expect(
      uploadProblemCode("image", file("a.jpg", "image/jpeg", 21 * MB))
    ).toBe("IMAGE_TOO_LARGE")
    expect(
      uploadProblemCode("document", file("a.jpg", "image/jpeg", 21 * MB))
    ).toBeNull()
    expect(
      uploadProblemCode("document", file("a.pdf", "application/pdf", 51 * MB))
    ).toBe("FILE_TOO_LARGE")
  })

  it("accepts a file exactly at the limit", () => {
    expect(
      uploadProblemCode("image", file("a.png", "image/png", 20 * MB))
    ).toBeNull()
  })
})

describe("uploadProblemCode for lesson videos", () => {
  it("accepts MP4 and WebM up to 1 GB", () => {
    expect(uploadProblemCode("video", file("intro.mp4", "video/mp4"))).toBe(
      null
    )
    expect(uploadProblemCode("video", file("intro.webm", ""))).toBe(null)
    expect(
      uploadProblemCode("video", file("intro.mp4", "video/mp4", 1024 * MB))
    ).toBe(null)
  })

  it("rejects other videos, documents and anything over 1 GB", () => {
    expect(
      uploadProblemCode("video", file("clip.mov", "video/quicktime"))
    ).toBe("VIDEO_TYPE_UNSUPPORTED")
    expect(
      uploadProblemCode("video", file("notes.pdf", "application/pdf"))
    ).toBe("VIDEO_TYPE_UNSUPPORTED")
    expect(
      uploadProblemCode("video", file("intro.mp4", "video/mp4", 1024 * MB + 1))
    ).toBe("VIDEO_TOO_LARGE")
    // A video is not a document either.
    expect(uploadProblemCode("document", file("intro.mp4", "video/mp4"))).toBe(
      "FILE_TYPE_UNSUPPORTED"
    )
  })
})
