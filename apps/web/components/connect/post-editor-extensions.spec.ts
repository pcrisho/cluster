import { getSchema } from "@tiptap/core"
import { assertValidDoc, schemaExtensions } from "@cluster/editor-schema"
import { POST_EDITOR_EXTENSIONS } from "./post-editor-extensions"

/**
 * The API stores a post body only if the shared editor schema accepts it, so the composer
 * must never produce a node, mark or attribute that schema lacks.
 */
describe("post composer output", () => {
  const composer = getSchema(POST_EDITOR_EXTENSIONS)
  const shared = getSchema(schemaExtensions)

  it("uses only nodes the shared schema knows, with the same attributes", () => {
    for (const [name, type] of Object.entries(composer.nodes)) {
      expect(shared.nodes).toHaveProperty(name)
      for (const attr of Object.keys(type.spec.attrs ?? {})) {
        expect(shared.nodes[name].spec.attrs ?? {}).toHaveProperty(attr)
      }
    }
  })

  it("uses only marks the shared schema knows, with the same attributes", () => {
    for (const [name, type] of Object.entries(composer.marks)) {
      expect(shared.marks).toHaveProperty(name)
      for (const attr of Object.keys(type.spec.attrs ?? {})) {
        expect(shared.marks[name].spec.attrs ?? {}).toHaveProperty(attr)
      }
    }
  })

  it("produces documents the API accepts", () => {
    const text = (value: string, marks?: object[]) => ({
      type: "text",
      text: value,
      ...(marks && { marks }),
    })
    const p = (...content: object[]) => ({ type: "paragraph", content })
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        p(
          text("bold", [{ type: "bold" }]),
          text("italic", [{ type: "italic" }]),
          text("underline", [{ type: "underline" }]),
          text("strike", [{ type: "strike" }]),
          text("code", [{ type: "code" }]),
          { type: "hardBreak" },
          text("link", [
            {
              type: "link",
              attrs: {
                href: "https://example.com",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ])
        ),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [p(text("one"))] }],
        },
        {
          type: "orderedList",
          attrs: { start: 3, type: null },
          content: [{ type: "listItem", content: [p(text("two"))] }],
        },
        { type: "blockquote", content: [p(text("quote"))] },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [text("x = 1")],
        },
        { type: "horizontalRule" },
      ],
    }
    // The composer serializes with editor.getJSON(), which builds the document from this schema.
    const json = composer.nodeFromJSON(doc).toJSON()
    expect(() => assertValidDoc(json, { orgId: "org" })).not.toThrow()
  })
})
