import { schemaExtensions } from "@cluster/editor-schema"
import { withoutHistory } from "./collaborative-schema"

describe("withoutHistory", () => {
  const starterKit = (exts: typeof schemaExtensions) =>
    exts.find((ext) => ext.name === "starterKit")!

  it("turns the StarterKit history off and keeps its other options", () => {
    const result = withoutHistory(schemaExtensions)
    expect(starterKit(result).options.undoRedo).toBe(false)
    expect(starterKit(result).options.dropcursor).toBe(false)
    expect(result).toHaveLength(schemaExtensions.length)
  })

  it("does not change the shared schema", () => {
    withoutHistory(schemaExtensions)
    expect(starterKit(schemaExtensions).options.undoRedo).not.toBe(false)
  })
})
