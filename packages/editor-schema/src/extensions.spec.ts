import { getSchema } from "@tiptap/core"

import { schemaExtensions } from "./extensions"

const schema = getSchema(schemaExtensions)

describe("schemaExtensions", () => {
  it("defines the custom and list nodes", () => {
    for (const name of [
      "image",
      "fileCard",
      "pageMention",
      "taskList",
      "taskItem",
    ]) {
      expect(schema.nodes[name]).toBeDefined()
    }
  })

  it("includes the formatting marks, underline and link", () => {
    for (const name of [
      "bold",
      "italic",
      "underline",
      "strike",
      "code",
      "link",
    ]) {
      expect(schema.marks[name]).toBeDefined()
    }
  })

  it("uses the mention defaults for page mentions", () => {
    const attrs = schema.nodes.pageMention.spec.attrs ?? {}
    expect(Object.keys(attrs).sort()).toEqual([
      "archived",
      "id",
      "label",
      "mentionSuggestionChar",
      "spaceId",
      "spaceName",
    ])
    expect(attrs.mentionSuggestionChar.default).toBe("@")
    expect(attrs.archived.default).toBe(false)
  })
})
