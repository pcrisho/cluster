import { extractText } from "./text"

const p = (...content: object[]) => ({ type: "paragraph", content })
const t = (text: string) => ({ type: "text", text })

describe("extractText", () => {
  it("joins marked text inside a paragraph without splitting words", () => {
    expect(extractText({ type: "doc", content: [p(t("hel"), t("lo"))] })).toBe(
      "hello"
    )
  })
  it("separates blocks, including nested lists", () => {
    const list = {
      type: "bulletList",
      content: [
        { type: "listItem", content: [p(t("one"))] },
        { type: "listItem", content: [p(t("two"))] },
      ],
    }
    expect(extractText({ type: "doc", content: [p(t("intro")), list] })).toBe(
      "intro one two"
    )
  })
  it("indexes page mentions by label and tolerates junk", () => {
    expect(
      extractText({
        type: "doc",
        content: [
          p(t("see "), { type: "pageMention", attrs: { label: "Policy" } }),
        ],
      })
    ).toBe("see Policy")
    expect(extractText(null)).toBe("")
    expect(extractText({ type: "doc" })).toBe("")
    expect(extractText("nope")).toBe("")
  })
  it("reads deeply nested blocks: task items and quotes inside lists", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [p(t("Sign"))],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                p(t("Send")),
                { type: "blockquote", content: [p(t("to HR"))] },
              ],
            },
          ],
        },
      ],
    }
    expect(extractText(doc)).toBe("Sign Send to HR")
  })
  it("keeps hard breaks inline and ignores images and file cards", () => {
    const doc = {
      type: "doc",
      content: [
        p(t("line"), { type: "hardBreak" }, t("two")),
        { type: "image", attrs: { src: "https://cdn.example.com/a.png" } },
        { type: "fileCard", attrs: { name: "a.pdf" } },
      ],
    }
    expect(extractText(doc)).toBe("linetwo")
  })
})
