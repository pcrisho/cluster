import en from "@/messages/en.json"
import { FILE_TYPES } from "@cluster/editor-schema"
import { fileTypeKey } from "./file-types"

describe("file type names", () => {
  it("every type in the shared catalog has a translated name", () => {
    const keys = Object.keys(en.fileTypes)
    for (const type of FILE_TYPES)
      expect(keys).toContain(fileTypeKey(type.label))
  })
})
