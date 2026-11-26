import { blocksDoc, formattingDoc, listsDoc } from "./__fixtures__"
import { docToMarkdown, markdownToDoc, MarkdownImportError } from "./markdown"
import { assertValidDoc } from "./validate"

const para = (...content: object[]) => ({ type: "paragraph", content })
const text = (value: string, ...marks: object[]) => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks } : {}),
})

describe("markdownToDoc", () => {
  it("reads headings, formatting, links and code", () => {
    const { doc, title } = markdownToDoc(
      [
        "# Guide",
        "",
        "Some **bold**, *italic*, ~~gone~~ and `code` with [a link](https://example.com/a).",
        "",
        "```ts",
        "const a = 1",
        "```",
      ].join("\n")
    )
    expect(title).toBe("Guide")
    expect(() => assertValidDoc(doc)).not.toThrow()
    expect(doc.content?.[0]).toEqual(
      para(
        text("Some "),
        text("bold", { type: "bold" }),
        text(", "),
        text("italic", { type: "italic" }),
        text(", "),
        text("gone", { type: "strike" }),
        text(" and "),
        text("code", { type: "code" }),
        text(" with "),
        text("a link", {
          type: "link",
          attrs: {
            href: "https://example.com/a",
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            class: null,
          },
        }),
        text(".")
      )
    )
    expect(doc.content?.[1]).toEqual({
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [text("const a = 1")],
    })
  })

  it("keeps the first heading in the body unless it is a level 1 heading", () => {
    expect(markdownToDoc("## Not a title\n\ntext").title).toBeNull()
    expect(markdownToDoc("text\n\n# Later").title).toBeNull()
  })

  it("reads task lists, and leaves mixed lists as plain lists", () => {
    const tasks = markdownToDoc("- [x] done\n- [ ] todo").doc
    expect(tasks.content?.[0]).toMatchObject({
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true } },
        { type: "taskItem", attrs: { checked: false } },
      ],
    })
    const mixed = markdownToDoc("- [x] done\n- plain").doc
    expect(mixed.content?.[0].type).toBe("bulletList")
    expect(() => assertValidDoc(tasks)).not.toThrow()
    expect(() => assertValidDoc(mixed)).not.toThrow()
  })

  it("splits a paragraph around an image, which is a block", () => {
    const { doc } = markdownToDoc("before ![logo](https://cdn.example.com/a.png) after")
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "image", "paragraph"])
    expect(() => assertValidDoc(doc)).not.toThrow()
  })

  it("refuses HTML", () => {
    expect(() => markdownToDoc("<script>alert(1)</script>")).toThrow(MarkdownImportError)
    expect(() => markdownToDoc("a <b>bold</b> word")).toThrow(MarkdownImportError)
  })

  it("drops links and images it cannot keep, and says so", () => {
    const { doc, dropped } = markdownToDoc(
      "[x](ftp://host/file) ![i](http://insecure/a.png) ![j](data:image/png;base64,AAAA)"
    )
    expect(dropped.sort()).toEqual(
      ["images that are not https links", "links that are not http, https or mailto"].sort()
    )
    expect(JSON.stringify(doc)).not.toContain("ftp:")
    expect(() => assertValidDoc(doc)).not.toThrow()
  })

  it("never produces a link the schema would refuse", () => {
    const { doc } = markdownToDoc("[bad](javascript:alert(1))")
    expect(() => assertValidDoc(doc)).not.toThrow()
    expect(JSON.stringify(doc)).not.toContain('"type":"link"') // stays plain text
  })

  it("answers an empty document for an empty source", () => {
    const { doc } = markdownToDoc("")
    expect(() => assertValidDoc(doc)).not.toThrow()
  })
})

describe("docToMarkdown", () => {
  it("writes the blocks fixture", () => {
    expect(docToMarkdown(blocksDoc).markdown).toBe(
      [
        "> Ship it small, ship it often.",
        "",
        "```typescript",
        "const total = items.length",
        "```",
        "",
        "```",
        "plain text",
        "```",
        "",
        "---",
        "",
        "Above the rule\\",
        "and below it",
        "",
      ].join("\n")
    )
  })

  it("names what Markdown cannot carry", () => {
    const { markdown, lost } = docToMarkdown(formattingDoc)
    expect(lost).toEqual(["underline"])
    expect(markdown).toContain("underline")
    expect(markdown).toContain("[the handbook](https://example.com/handbook)")
  })

  it("leaves out uploaded images and file cards, and keeps https images", () => {
    const { markdown, lost } = docToMarkdown({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "organizations/o/images/a.png", alt: "a", title: null } },
        { type: "image", attrs: { src: "https://cdn.example.com/b.png", alt: "b", title: null } },
        { type: "fileCard", attrs: { name: "x.pdf" } },
      ],
    })
    expect(markdown).toBe("![b](https://cdn.example.com/b.png)\n")
    expect(lost.sort()).toEqual(["file attachments", "images stored in Cluster"])
  })

  it("keeps spaces outside emphasis and escapes text that would be read as syntax", () => {
    const { markdown } = docToMarkdown({
      type: "doc",
      content: [
        para(text("a "), text(" bold ", { type: "bold" }), text(" 2 * 3 [x] _y_")),
        para(text("1. not a list")),
        para(text("# not a heading")),
      ],
    })
    expect(markdown).toBe("a  **bold**  2 \\* 3 \\[x\\] \\_y\\_\n\n1\\. not a list\n\n\\# not a heading\n")
  })
})

describe("round trip", () => {
  const cleaned = (doc: unknown) => JSON.parse(JSON.stringify(doc))

  it.each([
    ["blocks", blocksDoc],
    ["lists and task lists", listsDoc],
  ])("%s survive export and import", (_name, doc) => {
    const back = markdownToDoc(docToMarkdown(doc).markdown).doc
    expect(() => assertValidDoc(back)).not.toThrow()
    expect(cleaned(back)).toEqual(cleaned(doc))
  })

  it("keeps formatting except underline and the empty paragraph", () => {
    const back = markdownToDoc(docToMarkdown(formattingDoc).markdown)
    expect(() => assertValidDoc(back.doc)).not.toThrow()
    expect(back.title).toBe("Onboarding guide")
    const para1 = back.doc.content?.find((n) => n.type === "paragraph")
    expect(para1?.content?.map((n) => n.text).join("")).toBe(
      "Bold italic underline struck code() the handbook or write to hr@example.com"
    )
  })
})
