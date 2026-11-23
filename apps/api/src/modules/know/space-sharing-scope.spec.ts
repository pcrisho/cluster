import { entryInScope } from "./space-sharing-scope"

const inA = { all: false as const, nodeIds: new Set(["a", "areaA"]) }
const everyone = { all: true as const }

describe("entryInScope", () => {
  it("everything is in scope for a crosser or with isolation off", () => {
    expect(entryInScope(everyone, { user: { profile: null }, orgNodeId: null, position: null })).toBe(true)
    expect(entryInScope(everyone, { user: null, orgNodeId: "b", position: null })).toBe(true)
  })

  it("a person is in scope by their node, and a person with no node is out", () => {
    const person = (orgNodeId: string | null) => ({ user: { profile: { orgNodeId } }, orgNodeId: null, position: null })
    expect(entryInScope(inA, person("areaA"))).toBe(true)
    expect(entryInScope(inA, person("b"))).toBe(false)
    expect(entryInScope(inA, person(null))).toBe(false)
    expect(entryInScope(inA, { user: { profile: null }, orgNodeId: null, position: null })).toBe(false)
  })

  it("an area is in scope by its node", () => {
    expect(entryInScope(inA, { user: null, orgNodeId: "a", position: null })).toBe(true)
    expect(entryInScope(inA, { user: null, orgNodeId: "b", position: null })).toBe(false)
  })

  it("a position is in scope by its node, and a global position is out (it reaches every main node)", () => {
    const position = (orgNodeId: string | null) => ({ user: null, orgNodeId: null, position: { orgNodeId } })
    expect(entryInScope(inA, position(null))).toBe(false)
    expect(entryInScope(everyone, position(null))).toBe(true)
    expect(entryInScope(inA, position("areaA"))).toBe(true)
    expect(entryInScope(inA, position("b"))).toBe(false)
  })
})
