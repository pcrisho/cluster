import { Node, type Schema } from "@tiptap/pm/model"
import { getSchema } from "@tiptap/core"

import { titleExtensions } from "./title"

const schema: Schema = getSchema(titleExtensions)
const parse = (json: unknown) => Node.fromJSON(schema, json)
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})

describe("titleExtensions", () => {
  it("accepts a single line of plain text", () => {
    expect(() =>
      parse({ type: "doc", content: [paragraph("Travel policy")] }).check()
    ).not.toThrow()
  })

  it("rejects two paragraphs", () => {
    expect(() =>
      parse({
        type: "doc",
        content: [paragraph("one"), paragraph("two")],
      }).check()
    ).toThrow()
  })

  it("rejects marks and any other block", () => {
    expect(() =>
      parse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
            ],
          },
        ],
      }).check()
    ).toThrow()
    expect(() =>
      parse({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [] }],
      }).check()
    ).toThrow()
  })
})
