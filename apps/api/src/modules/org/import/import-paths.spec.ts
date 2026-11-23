import { matchPaths } from "./import-paths"
import type { ParsedRow, TreeNode } from "./import-types"

function row(n: number, nodes: string[], nodeCode: string | null = null): ParsedRow {
  return {
    row: n,
    nodes: [...nodes, "", "", "", "", "", ""].slice(0, 6),
    nodeCode,
    firstName: "A",
    lastName: "B",
    email: `p${n}@x.com`,
    employeeCode: null,
    position: null,
    isNodeManager: null,
    entryDate: null,
    canCreateSpaces: null,
    canDeleteSpaces: null,
  }
}

function node(id: string, name: string, parentId: string | null = null, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, parentId, name, code: null, isActive: true, ...extra }
}

function run(rows: ParsedRow[], tree: TreeNode[] = [], isolated = false) {
  let n = 0
  return matchPaths(rows, tree, { isolated, newId: () => `new${++n}` })
}

const codes = (r: { errors: { row: number; code: string; column?: string }[] }) =>
  r.errors.map((e) => `${e.row}:${e.code}:${e.column ?? ""}`)

describe("matchPaths", () => {
  const tree = [
    node("acme", "Acme Corp"),
    node("eng", "Engineering", "acme"),
    node("be", "Backend", "eng"),
    node("sales", "Sales", "acme"),
    node("other", "Other"),
    node("other-eng", "Engineering", "other"),
  ]

  it("finds an existing path ignoring case, accents and spaces", () => {
    const r = run([row(2, ["  acmé   CORP", "engineering", "BACKEND"])], tree)
    expect(r.errors).toEqual([])
    expect(r.newNodes).toEqual([])
    expect(r.nodeOfRow.get(2)).toBe("be")
  })

  it("treats the same child name in another branch as a different node", () => {
    const r = run([row(2, ["Other", "Engineering"]), row(3, ["Acme Corp", "Engineering"])], tree)
    expect(r.nodeOfRow.get(2)).toBe("other-eng")
    expect(r.nodeOfRow.get(3)).toBe("eng")
    expect(r.newNodes).toEqual([])
  })

  it("creates new nodes top-down, once per path, keeping the first written name", () => {
    const r = run([row(2, ["Globex", "Ops", "Night"]), row(3, ["GLOBEX", "ops", "Day"]), row(4, ["globex", "OPS"])])
    expect(r.errors).toEqual([])
    expect(r.newNodes).toEqual([
      {
        id: "new1",
        parentId: null,
        name: "Globex",
        code: null,
        path: ["Globex"],
      },
      {
        id: "new2",
        parentId: "new1",
        name: "Ops",
        code: null,
        path: ["Globex", "Ops"],
      },
      {
        id: "new3",
        parentId: "new2",
        name: "Night",
        code: null,
        path: ["Globex", "Ops", "Night"],
      },
      {
        id: "new4",
        parentId: "new2",
        name: "Day",
        code: null,
        path: ["Globex", "Ops", "Day"],
      },
    ])
    expect(r.nodeOfRow.get(2)).toBe("new3")
    expect(r.nodeOfRow.get(3)).toBe("new4")
    expect(r.nodeOfRow.get(4)).toBe("new2")
  })

  it("creates a new child under an existing parent with the full path", () => {
    const r = run([row(2, ["Acme Corp", "Engineering", "Mobile"])], tree)
    expect(r.newNodes).toEqual([
      {
        id: "new1",
        parentId: "eng",
        name: "Mobile",
        code: null,
        path: ["Acme Corp", "Engineering", "Mobile"],
      },
    ])
  })

  it("reports a gap on every affected row and drops it", () => {
    const r = run([row(2, ["Acme Corp", "", "Backend"]), row(3, ["Acme Corp"])], tree)
    expect(codes(r)).toEqual(["2:NODE_GAP:node_2"])
    expect(r.nodeOfRow.has(2)).toBe(false)
    expect(r.nodeOfRow.get(3)).toBe("acme")
  })

  it("requires a node only when isolated", () => {
    const empty = row(2, [])
    const free = run([empty], tree, false)
    expect(free.errors).toEqual([])
    expect(free.nodeOfRow.get(2)).toBeNull()
    const iso = run([empty], tree, true)
    expect(codes(iso)).toEqual(["2:NODE_REQUIRED:node_1"])
    expect(iso.nodeOfRow.has(2)).toBe(false)
  })

  it("flags siblings that match the same cell", () => {
    const dup = [...tree, node("eng2", "ENGINEERING", "acme")]
    const r = run([row(2, ["Acme Corp", "engineering"]), row(3, ["Acme Corp", "Sales"])], dup)
    expect(codes(r)).toEqual(["2:NODE_AMBIGUOUS:node_2"])
    expect(r.nodeOfRow.get(3)).toBe("sales")
  })

  it("flags roots that match the same cell", () => {
    const dup = [node("a", "Globex"), node("b", "globex")]
    const r = run([row(2, ["Globex"]), row(3, ["Globex", "Ops"])], dup)
    expect(codes(r)).toEqual(["2:NODE_AMBIGUOUS:node_1", "3:NODE_AMBIGUOUS:node_1"])
    expect(r.newNodes).toEqual([])
  })

  it("flags an archived main node and creates nothing under it", () => {
    const t = [node("old", "Old Co", null, { isActive: false })]
    const r = run([row(2, ["Old Co", "Ops"])], t)
    expect(codes(r)).toEqual(["2:NODE_ARCHIVED:node_1"])
    expect(r.newNodes).toEqual([])
  })

  it("flags an archived node deeper in the path", () => {
    const t = [...tree, node("arch", "Archive", "acme", { isActive: false })]
    const r = run([row(2, ["Acme Corp", "Archive", "X"]), row(3, ["Acme Corp", "Sales"])], t)
    expect(codes(r)).toEqual(["2:NODE_ARCHIVED:node_2"])
    expect(r.newNodes).toEqual([])
    expect(r.nodeOfRow.get(3)).toBe("sales")
  })

  it("rejects invalid new names but not existing ones", () => {
    const r = run([row(2, ["Acme Corp", "R&D <x>"]), row(3, ["Globex", "A"]), row(4, ["Acme Corp", "R&D (Lab)"])], tree)
    expect(codes(r)).toEqual(["2:NODE_NAME_INVALID:node_2", "3:NODE_NAME_INVALID:node_2"])
    expect(r.newNodes.map((n) => n.name)).toEqual(["R&D (Lab)"])
  })

  it("rejects a name longer than 100", () => {
    const r = run([row(2, ["x".repeat(101)])])
    expect(codes(r)).toEqual(["2:NODE_NAME_INVALID:node_1"])
  })

  describe("main-node code", () => {
    const coded = [node("acme", "Acme Corp", null, { code: "ACME" }), node("eng", "Engineering", "acme")]

    it("uses the node with that code whatever node_1 says, warns once, never renames", () => {
      const r = run([row(2, ["Acme Inc", "Engineering"], "ACME"), row(3, ["Acme Inc"], "ACME")], coded)
      expect(r.errors).toEqual([])
      expect(r.warnings).toEqual([
        {
          row: 2,
          column: "node_1",
          code: "NODE_NAME_DIFFERS",
          params: { code: "ACME", name: "Acme Corp" },
        },
      ])
      expect(r.nodeOfRow.get(2)).toBe("eng")
      expect(r.nodeOfRow.get(3)).toBe("acme")
      expect(r.newNodes).toEqual([])
    })

    it("does not warn when the name matches or node_1 is empty", () => {
      const r = run([row(2, ["acme corp"], "ACME"), row(3, [], "ACME")], coded)
      expect(r.warnings).toEqual([])
      expect(r.nodeOfRow.get(3)).toBe("acme")
    })

    it("errors when the code is unknown but a live main node has that name", () => {
      const r = run([row(2, ["Acme Corp"], "NEW")], coded)
      expect(r.errors).toEqual([
        {
          row: 2,
          column: "node_1_code",
          code: "NODE_CODE_MISMATCH",
          params: { code: "NEW", name: "Acme Corp" },
        },
      ])
    })

    it("creates a new main node with the code when nothing matches", () => {
      const r = run([row(2, ["Globex", "Ops"], "GLB")], coded)
      expect(r.newNodes).toEqual([
        {
          id: "new1",
          parentId: null,
          name: "Globex",
          code: "GLB",
          path: ["Globex"],
        },
        {
          id: "new2",
          parentId: "new1",
          name: "Ops",
          code: null,
          path: ["Globex", "Ops"],
        },
      ])
    })

    it("requires node_1 when the unknown code names nobody", () => {
      const r = run([row(2, [], "GLB")], coded)
      expect(codes(r)).toEqual(["2:REQUIRED:node_1"])
    })

    it("flags one name with two codes on every row of that name", () => {
      const r = run([
        row(2, ["Globex"], "A1"),
        row(3, ["globex"], "B2"),
        row(4, ["Globex"]),
        row(5, ["Other Co"], "C3"),
      ])
      expect(codes(r)).toEqual([
        "2:NODE_CODE_CONFLICT:node_1_code",
        "3:NODE_CODE_CONFLICT:node_1_code",
        "4:NODE_CODE_CONFLICT:node_1_code",
      ])
      expect(r.newNodes.map((n) => n.name)).toEqual(["Other Co"])
    })

    it("flags one code with two names on every row of that code", () => {
      const r = run([row(2, ["Globex"], "A1"), row(3, ["Initech"], "A1"), row(4, ["Globex"])])
      expect(codes(r)).toEqual([
        "2:NODE_CODE_CONFLICT:node_1_code",
        "3:NODE_CODE_CONFLICT:node_1_code",
        "4:NODE_CODE_CONFLICT:node_1_code",
      ])
      expect(r.newNodes).toEqual([])
    })

    it("lets rows without a code follow the coded row of that name", () => {
      const r = run([row(2, ["Globex", "Ops"]), row(3, ["Globex", "Ops"], "GLB"), row(4, ["GLOBEX"])])
      expect(r.errors).toEqual([])
      expect(r.newNodes.map((n) => [n.name, n.code])).toEqual([
        ["Globex", "GLB"],
        ["Ops", null],
      ])
      expect(r.nodeOfRow.get(2)).toBe("new2")
      expect(r.nodeOfRow.get(4)).toBe("new1")
    })

    it("lets rows without a code follow an existing coded node of the same name", () => {
      const r = run(
        [row(2, ["Acme Corp", "Engineering"], "ACME"), row(3, ["acme corp", "Sales"])],
        [...coded, node("sales", "Sales", "acme")],
      )
      expect(r.errors).toEqual([])
      expect(r.nodeOfRow.get(3)).toBe("sales")
    })
  })
})
