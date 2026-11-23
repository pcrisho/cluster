import type { PageTreeNode } from "@/lib/know-api"
import { ancestorIds, buildTree, planDrop, planMove } from "./page-tree"

const page = (id: string, parentId: string | null = null) =>
  ({ id, parentId, title: id }) as PageTreeNode

// a ─ a1, a2 ;  b ;  c
const pages = [
  page("a"),
  page("a1", "a"),
  page("a2", "a"),
  page("b"),
  page("c"),
]
const tree = buildTree(pages)

describe("buildTree", () => {
  it("nests children under their parent and keeps the sibling order", () => {
    expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"])
    expect(tree[0].children.map((n) => n.id)).toEqual(["a1", "a2"])
  })

  it("treats a page whose parent is missing as a root", () => {
    expect(buildTree([page("x", "gone")]).map((n) => n.id)).toEqual(["x"])
  })
})

describe("planMove", () => {
  it("moves up and down among siblings", () => {
    expect(planMove(tree, "b", "up")).toEqual({ parentId: null, index: 0 })
    expect(planMove(tree, "b", "down")).toEqual({ parentId: null, index: 2 })
    expect(planMove(tree, "a2", "up")).toEqual({ parentId: "a", index: 0 })
  })

  it("cannot move past the ends", () => {
    expect(planMove(tree, "a", "up")).toBeNull()
    expect(planMove(tree, "c", "down")).toBeNull()
  })

  it("indents under the sibling above, as its last child", () => {
    expect(planMove(tree, "b", "indent")).toEqual({ parentId: "a", index: 2 })
    expect(planMove(tree, "a", "indent")).toBeNull()
  })

  it("outdents to just after the parent", () => {
    expect(planMove(tree, "a1", "outdent")).toEqual({
      parentId: null,
      index: 1,
    })
    expect(planMove(tree, "a", "outdent")).toBeNull()
  })

  it("answers null for an unknown page", () => {
    expect(planMove(tree, "zzz", "up")).toBeNull()
  })
})

describe("ancestorIds", () => {
  it("lists the parents from the nearest up", () => {
    const deep = [page("a"), page("b", "a"), page("c", "b")]
    expect(ancestorIds(deep, "c")).toEqual(["b", "a"])
    expect(ancestorIds(deep, "a")).toEqual([])
  })

  it("stops on a cycle", () => {
    expect(ancestorIds([page("a", "b"), page("b", "a")], "a")).toEqual(["b"])
  })
})

describe("planDrop", () => {
  it("drops before or after a page among its siblings", () => {
    expect(planDrop(tree, "c", "a", "before")).toEqual({
      parentId: null,
      index: 0,
    })
    expect(planDrop(tree, "a", "c", "after")).toEqual({
      parentId: null,
      index: 2,
    })
    expect(planDrop(tree, "c", "a1", "after")).toEqual({
      parentId: "a",
      index: 1,
    })
  })

  it("drops inside a page as its last child", () => {
    expect(planDrop(tree, "c", "a", "inside")).toEqual({
      parentId: "a",
      index: 2,
    })
    expect(planDrop(tree, "a1", "b", "inside")).toEqual({
      parentId: "b",
      index: 0,
    })
  })

  it("counts the target's siblings without the dragged page", () => {
    // a2 dropped after a1 keeps its place; dropped before a1 goes first
    expect(planDrop(tree, "a2", "a1", "after")).toBeNull()
    expect(planDrop(tree, "a2", "a1", "before")).toEqual({
      parentId: "a",
      index: 0,
    })
  })

  it("does nothing for a drop that changes nothing", () => {
    expect(planDrop(tree, "b", "b", "inside")).toBeNull()
    expect(planDrop(tree, "b", "a", "after")).toBeNull()
    expect(planDrop(tree, "b", "c", "before")).toBeNull()
  })

  it("refuses to nest a page under itself or its descendants", () => {
    expect(planDrop(tree, "a", "a1", "inside")).toBeNull()
    expect(planDrop(tree, "a", "a2", "after")).toBeNull()
  })
})
