import { areaPathLabel, isCrosser, mainNodeOf, subtreeIds } from "./partition"

const person = (
  over: Partial<{
    role: string
    capabilities: string[]
    isSuperAdmin: boolean
  }> = {}
) => ({
  role: "COLLABORATOR",
  capabilities: [] as string[],
  isSuperAdmin: false,
  ...over,
})

describe("isCrosser", () => {
  it.each([
    ["an admin", person({ role: "ADMIN" })],
    ["a moderator", person({ role: "MANAGER" })],
    ["a course manager", person({ capabilities: ["GROW_COURSE_MANAGE"] })],
    ["the superadmin", person({ isSuperAdmin: true })],
  ])("treats %s as a crosser", (_, user) => {
    expect(isCrosser(user)).toBe(true)
  })

  it("does not cross for a collaborator with other capabilities or no user", () => {
    expect(isCrosser(person({ capabilities: ["KNOW_SPACE_CREATE"] }))).toBe(
      false
    )
    expect(isCrosser(null)).toBe(false)
    expect(isCrosser(undefined)).toBe(false)
  })
})

describe("mainNodeOf", () => {
  // a -> a1 -> a11, b (top level)
  const parentOf = new Map<string, string | null>([
    ["a", null],
    ["a1", "a"],
    ["a11", "a1"],
    ["b", null],
  ])

  it("walks up to the top node", () => {
    expect(mainNodeOf("a11", parentOf)).toBe("a")
    expect(mainNodeOf("a", parentOf)).toBe("a")
  })

  it("is null for no node, an unknown node or a loop in the data", () => {
    expect(mainNodeOf(null, parentOf)).toBeNull()
    expect(mainNodeOf("zz", parentOf)).toBeNull()
    const loop = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
    ])
    expect(mainNodeOf("x", loop)).toBeNull()
  })
})

describe("subtreeIds", () => {
  it("collects the node and everything below, once, even with a loop", () => {
    const children = new Map([
      ["a", ["a1", "a2"]],
      ["a1", ["a11"]],
      ["a11", ["a"]],
    ])
    expect([...subtreeIds("a", children)].sort()).toEqual([
      "a",
      "a1",
      "a11",
      "a2",
    ])
    expect([...subtreeIds("a2", children)]).toEqual(["a2"])
  })
})

describe("areaPathLabel", () => {
  it("joins the names from the top node down", () => {
    const byId = new Map([
      ["a", { name: "Engineering", parentId: null }],
      ["a1", { name: "Backend", parentId: "a" }],
    ])
    expect(areaPathLabel("a1", byId)).toBe("Engineering › Backend")
    expect(areaPathLabel("a", byId)).toBe("Engineering")
  })
})
