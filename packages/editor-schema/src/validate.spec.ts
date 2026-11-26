import {
  InvalidDocError,
  assertValidDoc,
  isAllowedImageSrc,
  isAllowedLinkHref,
} from "./validate"

const text = (value: string, marks?: object[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
})
const paragraph = (...content: object[]) => ({ type: "paragraph", content })
const doc = (...content: object[]) => ({ type: "doc", content })
const link = (href: string) => ({ type: "link", attrs: { href } })
const uuid = "3f2b7c9e-1a4d-4b8e-9c2a-5d6e7f8a9b0c"
const image = (attrs: object) => ({
  type: "image",
  attrs: { src: "https://cdn.example.com/a.png", ...attrs },
})
const fileCard = (attrs: object) => ({ type: "fileCard", attrs: { ...attrs } })
const pageMention = (attrs: object) => ({
  type: "pageMention",
  attrs: { id: uuid, spaceId: uuid, label: "Page", ...attrs },
})

function invalidError(
  json: unknown,
  options?: { orgId?: string }
): InvalidDocError {
  try {
    assertValidDoc(json, options)
  } catch (error) {
    if (error instanceof InvalidDocError) return error
    throw error
  }
  throw new Error("expected assertValidDoc to throw")
}

describe("assertValidDoc", () => {
  it("accepts a document with every supported node and mark", () => {
    expect(() =>
      assertValidDoc(
        doc(
          paragraph(
            text("plain"),
            text("link", [link("https://example.com")]),
            { type: "hardBreak" }
          ),
          { type: "image", attrs: { src: "https://cdn.example.com/a.png" } },
          {
            type: "fileCard",
            attrs: { documentId: uuid, versionId: uuid, name: "a.pdf" },
          }
        )
      )
    ).not.toThrow()
  })

  it("names the path of an unknown node type", () => {
    const error = invalidError(
      doc(paragraph(text("ok")), {
        type: "blockquote",
        content: [paragraph(text("a"), { type: "widget" })],
      })
    )
    expect(error).toBeInstanceOf(InvalidDocError)
    expect(error.path).toBe("content[1].content[0].content[1]")
    expect(error.message).toContain('unknown node type "widget"')
  })

  it("treats prototype property names as unknown node types", () => {
    const error = invalidError(doc({ type: "toString" }))
    expect(error.path).toBe("content[0]")
  })

  it("rejects an unknown mark type", () => {
    const error = invalidError(doc(paragraph(text("x", [{ type: "comic" }]))))
    expect(error.path).toBe("content[0].content[0].marks[0]")
    expect(error.message).toContain('unknown mark type "comic"')
  })

  it("rejects an unknown attribute on a node or a mark", () => {
    const onNode = invalidError(
      doc({ type: "heading", attrs: { level: 1, onclick: "x()" } })
    )
    expect(onNode.message).toContain('unknown attribute "onclick"')
    const onMark = invalidError(
      doc(
        paragraph(
          text("x", [
            { type: "link", attrs: { href: "https://a.com", onclick: "x" } },
          ])
        )
      )
    )
    expect(onMark.message).toContain('unknown attribute "onclick"')
  })

  it("rejects a javascript: link and points at its href", () => {
    const error = invalidError(
      doc(paragraph(text("click", [link("javascript:alert(1)")])))
    )
    expect(error.path).toBe("content[0].content[0].marks[0].attrs.href")
  })

  it("rejects obfuscated javascript: links", () => {
    expect(() =>
      assertValidDoc(doc(paragraph(text("x", [link("JaVaScRiPt:alert(1)")]))))
    ).toThrow(InvalidDocError)
    expect(() =>
      assertValidDoc(
        doc(paragraph(text("x", [link("  Ja\tvaScRi\nPt :alert(1)")])))
      )
    ).toThrow(InvalidDocError)
  })

  it("rejects data:, vbscript: and protocol-relative links", () => {
    for (const href of [
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.example.com",
      "/know/spaces/1/2",
    ]) {
      expect(() =>
        assertValidDoc(doc(paragraph(text("x", [link(href)]))))
      ).toThrow(InvalidDocError)
    }
  })

  it("rejects an image with an external http URL or a data: URI", () => {
    const external = invalidError(
      doc({ type: "image", attrs: { src: "http://evil.com/x.png" } })
    )
    expect(external.path).toBe("content[0].attrs.src")
    expect(() =>
      assertValidDoc(
        doc({ type: "image", attrs: { src: "data:image/png;base64,AAAA" } })
      )
    ).toThrow(InvalidDocError)
  })

  it("accepts a storage key of an organization", () => {
    expect(() =>
      assertValidDoc(
        doc({
          type: "image",
          attrs: { src: "organizations/abc/uploads/3f2b7c9e.png" },
        })
      )
    ).not.toThrow()
  })

  it("rejects a storage key of another organization when orgId is given", () => {
    const error = invalidError(
      doc(paragraph(text("x")), {
        type: "image",
        attrs: { src: "organizations/other/uploads/a.png" },
      }),
      { orgId: "abc" }
    )
    expect(error.path).toBe("content[1].attrs.src")
    expect(error.message).toContain("content[1].attrs.src")
  })

  it("accepts a storage key of the same organization when orgId is given", () => {
    expect(() =>
      assertValidDoc(
        doc({
          type: "image",
          attrs: { src: "organizations/abc/uploads/a.png" },
        }),
        { orgId: "abc" }
      )
    ).not.toThrow()
  })

  it("does not check the organization of https images", () => {
    expect(() =>
      assertValidDoc(
        doc({ type: "image", attrs: { src: "https://cdn.example.com/a.png" } }),
        { orgId: "abc" }
      )
    ).not.toThrow()
  })

  it("rejects content the schema does not allow, such as a heading inside a paragraph", () => {
    const error = invalidError(
      doc({
        type: "paragraph",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [text("h")] },
        ],
      })
    )
    expect(error.message).toMatch(/^Invalid document/)
  })

  it("rejects a root that is not a doc node", () => {
    for (const json of [
      { type: "paragraph", content: [] },
      null,
      "doc",
      [{ type: "doc" }],
    ]) {
      const error = invalidError(json)
      expect(error.path).toBe("")
      expect(error.message).toContain('root node must be of type "doc"')
    }
  })

  it("rejects documents nested deeper than 100 levels", () => {
    let node: object = paragraph(text("deep"))
    for (let level = 0; level < 150; level++) {
      node = { type: "blockquote", content: [node] }
    }
    const error = invalidError(doc(node))
    expect(error.message).toContain("nesting exceeds 100 levels")
  })

  it("rejects malformed structure without throwing raw errors", () => {
    expect(() =>
      assertValidDoc(doc({ type: "paragraph", content: "text" }))
    ).toThrow(InvalidDocError)
    expect(() => assertValidDoc(doc({ type: 42 }))).toThrow(InvalidDocError)
    expect(() => assertValidDoc(doc(paragraph(text(""))))).toThrow(
      InvalidDocError
    )
  })
})

describe("attribute values", () => {
  it("accepts valid values for every attribute with a rule", () => {
    expect(() =>
      assertValidDoc(
        doc(
          paragraph(
            pageMention({
              spaceName: null,
              archived: true,
              mentionSuggestionChar: "#",
            }),
            pageMention({ id: null, spaceId: null, label: null })
          ),
          image({ alt: "Logo", title: null }),
          fileCard({
            documentId: "",
            versionId: uuid.toUpperCase(),
            name: "a.pdf",
            mimetype: "application/pdf",
            size: 0,
            versionNumber: 3,
          }),
          { type: "heading", attrs: { level: 6 }, content: [text("h")] }
        )
      )
    ).not.toThrow()
  })

  it("rejects an object or an array as an attribute value", () => {
    for (const src of [{}, []]) {
      const error = invalidError(doc(image({ src })))
      expect(error.path).toBe("content[0].attrs.src")
      expect(error.message).toContain('attribute "src"')
    }
  })

  it("rejects NaN and Infinity as numbers", () => {
    for (const size of [NaN, Infinity]) {
      const error = invalidError(doc(fileCard({ size })))
      expect(error.path).toBe("content[0].attrs.size")
    }
  })

  it("rejects a string longer than 2000 characters", () => {
    const error = invalidError(
      doc(image({ src: `https://cdn.example.com/${"a".repeat(5000)}` }))
    )
    expect(error.path).toBe("content[0].attrs.src")
    expect(error.message).toContain('attribute "src"')
  })

  it("rejects a negative file size", () => {
    const error = invalidError(doc(fileCard({ size: -1 })))
    expect(error.path).toBe("content[0].attrs.size")
    expect(error.message).toContain('attribute "size"')
  })

  it("rejects a non-UUID page mention id and file card document id", () => {
    const mentionId = invalidError(
      doc(paragraph(pageMention({ id: "page-1" })))
    )
    expect(mentionId.path).toBe("content[0].content[0].attrs.id")
    const documentId = invalidError(doc(fileCard({ documentId: "d" })))
    expect(documentId.path).toBe("content[0].attrs.documentId")
  })

  it("rejects a page mention label longer than 500 characters", () => {
    const error = invalidError(
      doc(paragraph(pageMention({ label: "x".repeat(501) })))
    )
    expect(error.path).toBe("content[0].content[0].attrs.label")
  })

  it("rejects a non-boolean archived flag on a page mention", () => {
    const error = invalidError(doc(paragraph(pageMention({ archived: "yes" }))))
    expect(error.path).toBe("content[0].content[0].attrs.archived")
  })

  it("rejects a heading level outside 1-6", () => {
    const error = invalidError(
      doc({ type: "heading", attrs: { level: 9 }, content: [text("h")] })
    )
    expect(error.path).toBe("content[0].attrs.level")
    expect(error.message).toContain('attribute "level"')
  })

  it("rejects a non-integer version number", () => {
    const error = invalidError(doc(fileCard({ versionNumber: 1.5 })))
    expect(error.path).toBe("content[0].attrs.versionNumber")
  })

  it("rejects a version number below 1", () => {
    const error = invalidError(doc(fileCard({ versionNumber: 0 })))
    expect(error.path).toBe("content[0].attrs.versionNumber")
  })

  it("rejects a non-string alt text on an image", () => {
    const error = invalidError(doc(image({ alt: 42 })))
    expect(error.path).toBe("content[0].attrs.alt")
  })
})

describe("isAllowedLinkHref", () => {
  it.each([
    "https://example.com/a?b=c#d",
    "http://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:hr@example.com",
  ])("allows %s", (href) => {
    expect(isAllowedLinkHref(href)).toBe(true)
  })

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " java script:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "//evil.example.com",
    "/relative/path",
    "https://",
    "ftp://example.com",
    "",
    undefined,
    42,
  ])("rejects %p", (href) => {
    expect(isAllowedLinkHref(href)).toBe(false)
  })
})

describe("isAllowedImageSrc", () => {
  it.each([
    "https://cdn.example.com/office.png",
    "organizations/abc/uploads/x.png",
    "organizations/abc/images/2026/map.webp",
  ])("allows %s", (src) => {
    expect(isAllowedImageSrc(src)).toBe(true)
  })

  it.each([
    "http://evil.com/x.png",
    "http://localhost:3001/api/v1/files/organizations/abc/x.png",
    "/api/v1/files/organizations/abc/x.png",
    "/files/organizations/abc/x.png?v=2",
    "organizations/abc/../../secret.png",
    "organizations/abc/x\u0000.png",
    "organizations/abc/x\u0001.png",
    "organizations//x.png",
    "organizations/abc",
    "static/organizations/abc/x.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "//evil.example.com/files/organizations/x.png",
    "/\\evil.example.com/files/organizations/x.png",
    "/static/logo.png",
    "blob:https://app/1234",
    "",
    null,
  ])("rejects %p", (src) => {
    expect(isAllowedImageSrc(src)).toBe(false)
  })
})
