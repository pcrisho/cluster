import { isCrosser, isolationBlocksModule, mainNodeOf, nodeInScope, partitionScope } from "./partition"

// root → {a → {a1}, b}; two main nodes: a (with a1) and b. "loop" cycles on itself.
const parentOf = new Map<string, string | null>([
  ["root", null],
  ["a", "root"],
  ["a1", "a"],
  ["b", "root"],
  ["loop-x", "loop-y"],
  ["loop-y", "loop-x"],
])
const user = (role: string, capabilities: string[] = [], isSuperAdmin = false) => ({
  role,
  capabilities,
  isSuperAdmin,
})

describe("isCrosser", () => {
  it("is true for ADMIN, MANAGER, GROW_COURSE_MANAGE holders and superadmins", () => {
    expect(isCrosser(user("ADMIN"))).toBe(true)
    expect(isCrosser(user("MANAGER"))).toBe(true)
    expect(isCrosser(user("COLLABORATOR", ["GROW_COURSE_MANAGE"]))).toBe(true)
    expect(isCrosser(user("COLLABORATOR", [], true))).toBe(true)
  })
  it("is false for a plain collaborator", () => {
    expect(isCrosser(user("COLLABORATOR"))).toBe(false)
    expect(isCrosser({ role: "COLLABORATOR", capabilities: ["KNOW_SPACE_CREATE"] })).toBe(false)
  })
})

describe("mainNodeOf", () => {
  it("walks up to the node with no parent", () => {
    expect(mainNodeOf("a1", parentOf)).toBe("root")
    expect(mainNodeOf("root", parentOf)).toBe("root")
  })
  it("returns null for no node, an unknown node or a loop in the data", () => {
    expect(mainNodeOf(null, parentOf)).toBeNull()
    expect(mainNodeOf("missing", parentOf)).toBeNull()
    expect(mainNodeOf("loop-x", parentOf)).toBeNull()
  })
})

describe("partitionScope", () => {
  const plain = user("COLLABORATOR")

  it("is the whole organization when isolation is off", () => {
    expect(partitionScope(plain, false, parentOf, "a1")).toEqual({ all: true })
    expect(partitionScope(plain, false, parentOf, null)).toEqual({ all: true })
  })
  it("is the whole organization for a crosser even when isolated", () => {
    expect(partitionScope(user("ADMIN"), true, parentOf, null)).toEqual({
      all: true,
    })
    expect(partitionScope(user("MANAGER"), true, parentOf, "a1")).toEqual({
      all: true,
    })
    expect(partitionScope(user("COLLABORATOR", ["GROW_COURSE_MANAGE"]), true, parentOf, "b")).toEqual({ all: true })
    expect(partitionScope(user("COLLABORATOR", [], true), true, parentOf, "b")).toEqual({ all: true })
  })
  it("is the subtree of the main node for a plain collaborator (one root here, so the whole tree)", () => {
    expect(partitionScope(plain, true, parentOf, "a1")).toEqual({
      all: false,
      nodeIds: new Set(["root", "a", "a1", "b"]),
    })
  })
  it("sees nothing for a person with no node", () => {
    expect(partitionScope(plain, true, parentOf, null)).toEqual({
      all: false,
      nodeIds: new Set(),
    })
  })
  it("sees nothing when the node has no main node (loop or unknown)", () => {
    expect(partitionScope(plain, true, parentOf, "loop-x")).toEqual({
      all: false,
      nodeIds: new Set(),
    })
    expect(partitionScope(plain, true, parentOf, "missing")).toEqual({
      all: false,
      nodeIds: new Set(),
    })
  })
})

describe("partitionScope with two main nodes", () => {
  // Two independent main nodes: "alpha" (with "alpha-child") and "beta".
  const forest = new Map<string, string | null>([
    ["alpha", null],
    ["alpha-child", "alpha"],
    ["beta", null],
  ])
  it("confines a plain collaborator in A to A's tree, and B's collaborator to B's", () => {
    expect(partitionScope(user("COLLABORATOR"), true, forest, "alpha-child")).toEqual({
      all: false,
      nodeIds: new Set(["alpha", "alpha-child"]),
    })
    const scopeB = partitionScope(user("COLLABORATOR"), true, forest, "beta")
    expect(scopeB).toEqual({ all: false, nodeIds: new Set(["beta"]) })
    if (scopeB.all) throw new Error("unexpected")
    expect(nodeInScope(scopeB, "alpha")).toBe(false)
    expect(nodeInScope(scopeB, "alpha-child")).toBe(false)
  })
})

describe("nodeInScope", () => {
  it("is always true for the whole organization, including no node", () => {
    expect(nodeInScope({ all: true }, null)).toBe(true)
    expect(nodeInScope({ all: true }, "a")).toBe(true)
  })
  it("is true only for nodes in the set; a null node is out of a partial scope", () => {
    const scope = { all: false as const, nodeIds: new Set(["a"]) }
    expect(nodeInScope(scope, "a")).toBe(true)
    expect(nodeInScope(scope, "b")).toBe(false)
    expect(nodeInScope(scope, null)).toBe(false)
  })
})

describe("isolationBlocksModule", () => {
  it("is true only when isolated and CONNECT or LIFE is enabled", () => {
    expect(isolationBlocksModule(true, ["CONNECT"])).toBe(true)
    expect(isolationBlocksModule(true, ["LIFE", "KNOW"])).toBe(true)
    expect(isolationBlocksModule(true, ["KNOW", "GROW"])).toBe(false)
    expect(isolationBlocksModule(false, ["CONNECT", "LIFE"])).toBe(false)
    expect(isolationBlocksModule(false, [])).toBe(false)
  })
})
