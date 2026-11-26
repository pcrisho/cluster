import { maxRole, roleAtLeast } from "./access-role"
import { nodeAndAncestors, principalWhere, type PrincipalContext } from "./principal"

const tree = new Map<string, string | null>([
  ["company", null],
  ["ops", "company"],
  ["safety", "ops"],
  ["hr", "company"],
])

describe("nodeAndAncestors", () => {
  it("returns the area and every area above it, nearest first", () => {
    expect(nodeAndAncestors("safety", tree)).toEqual(["safety", "ops", "company"])
    expect(nodeAndAncestors("company", tree)).toEqual(["company"])
  })
  it("is empty without an area and survives a cycle", () => {
    expect(nodeAndAncestors(null, tree)).toEqual([])
    expect(nodeAndAncestors("a", new Map([["a", "b"], ["b", "a"]]))).toEqual(["a", "b"])
  })
})

describe("principalWhere", () => {
  it("builds a filter with only the clauses the user can match", () => {
    const ctx: PrincipalContext = { userId: "u1", orgNodeIds: ["safety", "ops", "company"], positionId: "p1" }
    expect(principalWhere(ctx).OR).toEqual([{ userId: "u1" }, { orgNodeId: { in: ctx.orgNodeIds } }, { positionId: "p1" }])
    expect(principalWhere({ userId: "u1", orgNodeIds: [], positionId: null }).OR).toEqual([{ userId: "u1" }])
  })
})

describe("roles", () => {
  it("picks the strongest role", () => {
    expect(maxRole(["VIEWER", "MANAGER", "EDITOR"])).toBe("MANAGER")
    expect(maxRole([])).toBeNull()
  })
  it("compares against a minimum", () => {
    expect(roleAtLeast("EDITOR", "EDITOR")).toBe(true)
    expect(roleAtLeast("VIEWER", "EDITOR")).toBe(false)
    expect(roleAtLeast(null, "VIEWER")).toBe(false)
  })
})
