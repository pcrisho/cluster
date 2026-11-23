import {
  blocksDoc,
  customNodesDoc,
  formattingDoc,
  listsDoc,
} from "./__fixtures__"
import { EMPTY_DOC } from "./empty-doc"
import { assertValidDoc } from "./validate"

describe("documents written by the TipTap 2 editor", () => {
  it.each([
    ["formatting", formattingDoc],
    ["lists and task lists", listsDoc],
    ["blocks", blocksDoc],
    ["custom nodes", customNodesDoc],
  ])("validates the %s fixture", (_name, json) => {
    expect(() => assertValidDoc(json)).not.toThrow()
  })

  it("validates the empty document", () => {
    expect(() => assertValidDoc(EMPTY_DOC)).not.toThrow()
  })
})
