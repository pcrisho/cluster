import { planImport } from "./import-plan"
import type { ImportIssue, ImportSnapshot, MemberSnapshot, ParsedRow, TreeNode } from "./import-types"

function row(n: number, extra: Partial<ParsedRow> = {}, nodes: string[] = ["Acme", "Eng"]): ParsedRow {
  return {
    row: n,
    nodes: [...nodes, "", "", "", "", "", ""].slice(0, 6),
    nodeCode: null,
    firstName: "Ana",
    lastName: "Diaz",
    email: `p${n}@x.com`,
    employeeCode: null,
    position: null,
    isNodeManager: null,
    entryDate: null,
    canCreateSpaces: null,
    canDeleteSpaces: null,
    ...extra,
  }
}

const node = (id: string, name: string, parentId: string | null = null): TreeNode => ({
  id,
  parentId,
  name,
  code: null,
  isActive: true,
})

const TREE = [
  node("acme", "Acme"),
  node("eng", "Eng", "acme"),
  node("ops", "Ops", "acme"),
  node("globex", "Globex"),
  node("gsales", "Sales", "globex"),
]

function member(id: string, extra: Partial<MemberSnapshot> = {}): MemberSnapshot {
  return {
    id,
    email: `${id}@x.com`,
    firstName: "Ana",
    lastName: "Diaz",
    role: "COLLABORATOR",
    isSuperAdmin: false,
    isActive: true,
    employeeCode: null,
    orgNodeId: "eng",
    positionId: null,
    joinedAt: null,
    capabilities: [],
    managesNodeId: null,
    ...extra,
  }
}

function snap(extra: Partial<ImportSnapshot> = {}, members: MemberSnapshot[] = []): ImportSnapshot {
  return {
    tree: TREE,
    managerOf: new Map(),
    managerNames: new Map(),
    positions: [],
    members: new Map(members.map((m) => [m.email, m])),
    employeeCodes: new Map(),
    emailsElsewhere: new Set(),
    isolated: false,
    knowEnabled: true,
    ...extra,
  }
}

function plan(rows: ParsedRow[], snapshot: ImportSnapshot, errors: ImportIssue[] = []) {
  let n = 0
  return planImport({ rows, errors }, snapshot, { newId: () => `new${++n}` })
}

const brief = (list: ImportIssue[]) => list.map((i) => `${i.row}:${i.code}:${i.column ?? ""}`)
const existing = (id: string, extra: Partial<ParsedRow> = {}, nodes?: string[]) =>
  row(2, { email: `${id}@x.com`, firstName: null, lastName: null, ...extra }, nodes)

describe("planImport", () => {
  describe("people", () => {
    it("creates a new member in the row's node, without a role, and counts it", () => {
      const p = plan(
        [
          row(2, {
            employeeCode: "E1",
            entryDate: "2026-01-02",
            canCreateSpaces: true,
          }),
        ],
        snap(),
      )
      expect(p.report).toMatchObject({
        rows: 1,
        create: 1,
        update: 0,
        unchanged: 0,
        errors: [],
        warnings: [],
      })
      expect(p.writes.newMembers).toEqual([
        {
          id: "new1",
          row: 2,
          email: "p2@x.com",
          firstName: "Ana",
          lastName: "Diaz",
          employeeCode: "E1",
          orgNodeId: "eng",
          positionId: null,
          joinedAt: "2026-01-02",
          capabilities: ["KNOW_SPACE_CREATE"],
        },
      ])
      expect(JSON.stringify(p.writes)).not.toMatch(/role/i)
    })

    it("lists the nodes to create and puts the new member in the new node", () => {
      const p = plan([row(2, {}, ["Initech", "HR"])], snap())
      expect(p.report.nodesToCreate).toEqual([["Initech"], ["Initech", "HR"]])
      expect(p.writes.newNodes).toHaveLength(2)
      expect(p.writes.newMembers[0].orgNodeId).toBe(p.writes.newNodes[1].id)
    })

    it("requires the names of a new member only", () => {
      const p = plan(
        [row(2, { firstName: null, lastName: null }), existing("u1", { entryDate: "2026-02-02" })],
        snap({}, [member("u1")]),
      )
      expect(brief(p.report.errors)).toEqual(["2:REQUIRED:first_name", "2:REQUIRED:last_name"])
    })

    it("refuses an address of another organization without naming anything", () => {
      const p = plan([row(2)], snap({ emailsElsewhere: new Set(["p2@x.com"]) }))
      expect(p.report.errors).toEqual([{ row: 2, column: "email", code: "EMAIL_UNAVAILABLE" }])
      expect(p.writes.newMembers).toEqual([])
    })

    it("refuses inactive members and the superadmin", () => {
      const p = plan(
        [row(2, { email: "a@x.com" }), row(3, { email: "b@x.com" })],
        snap({}, [member("a", { isActive: false }), member("b", { isSuperAdmin: true, role: "ADMIN" })]),
      )
      expect(brief(p.report.errors)).toEqual(["2:MEMBER_INACTIVE:email", "3:SUPERADMIN_PROTECTED:email"])
    })

    it("carries over the parser's and the path matcher's errors", () => {
      const parseError: ImportIssue = {
        row: 5,
        column: "email",
        code: "EMAIL_INVALID",
      }
      const p = plan([row(2, {}, ["Acme", "", "Gap"])], snap(), [parseError])
      expect(brief(p.report.errors)).toEqual(["2:NODE_GAP:node_2", "5:EMAIL_INVALID:email"])
    })
  })

  describe("updates", () => {
    it("writes only the changed columns and never touches an empty cell", () => {
      const m = member("u1", {
        firstName: "Old",
        employeeCode: "E1",
        joinedAt: "2025-01-01",
      })
      const p = plan(
        [
          existing("u1", {
            lastName: "Diaz",
            employeeCode: "E2",
            entryDate: "2025-01-01",
          }),
        ],
        snap({}, [m]),
      )
      expect(p.report).toMatchObject({
        create: 0,
        update: 1,
        unchanged: 0,
        warnings: [],
      })
      expect(p.writes.updates).toEqual([
        {
          userId: "u1",
          row: 2,
          user: { orgColaboratorId: "E2" },
          profile: {},
          capabilities: { add: [], remove: [] },
        },
      ])
    })

    it("sets assignmentChangedAt on a real node change only, and skips a row that names the current node", () => {
      const m = member("u1")
      const moved = plan([existing("u1", {}, ["Acme", "Ops"])], snap({}, [m]))
      expect(moved.writes.updates[0].profile).toEqual({
        orgNodeId: "ops",
        assignmentChangedAt: true,
      })
      const same = plan([existing("u1", { entryDate: "2026-03-03" })], snap({}, [m]))
      expect(same.writes.updates[0].profile).toEqual({
        joinedAt: "2026-03-03",
      })
    })

    it("keeps the node when the row names no node cells", () => {
      const p = plan([existing("u1", { entryDate: "2026-03-03" }, [])], snap({}, [member("u1")]))
      expect(p.writes.updates[0].profile).toEqual({ joinedAt: "2026-03-03" })
    })

    it("warns NO_CHANGES and writes nothing when nothing differs", () => {
      const p = plan([existing("u1")], snap({}, [member("u1")]))
      expect(p.report).toMatchObject({ create: 0, update: 0, unchanged: 1 })
      expect(p.report.warnings).toEqual([{ row: 2, code: "NO_CHANGES" }])
      expect(p.writes.updates).toEqual([])
    })

    it("adds a missing capability, removes a present one on `no`, keeps on empty", () => {
      const m = member("u1", {
        capabilities: ["KNOW_SPACE_DELETE", "GROW_COURSE_MANAGE"],
      })
      const p = plan([existing("u1", { canCreateSpaces: true, canDeleteSpaces: false })], snap({}, [m]))
      expect(p.writes.updates[0].capabilities).toEqual({
        add: ["KNOW_SPACE_CREATE"],
        remove: ["KNOW_SPACE_DELETE"],
      })
      const keep = plan([existing("u1", { canCreateSpaces: false })], snap({}, [m]))
      expect(keep.report.unchanged).toBe(1)
    })

    it("refuses `yes` capabilities while KNOW is off", () => {
      const p = plan([row(2, { canDeleteSpaces: true })], snap({ knowEnabled: false }))
      expect(brief(p.report.errors)).toEqual(["2:CAPABILITY_MODULE_OFF:can_delete_spaces"])
    })
  })

  describe("employee codes", () => {
    it("refuses a code held by another member, but not the member's own", () => {
      const s = snap(
        {
          employeeCodes: new Map([
            ["E1", "other"],
            ["E2", "u1"],
          ]),
        },
        [member("u1", { employeeCode: "E2" })],
      )
      const p = plan(
        [row(2, { employeeCode: "E1" }), existing("u1", { employeeCode: "E2" })].map((r, i) => ({ ...r, row: i + 2 })),
        s,
      )
      expect(brief(p.report.errors)).toEqual(["2:EMPLOYEE_CODE_TAKEN:employee_code"])
    })

    it("refuses the same code twice in the file on the later row", () => {
      const p = plan([row(2, { employeeCode: "E9" }), row(3, { employeeCode: "E9" })], snap())
      expect(brief(p.report.errors)).toEqual(["3:EMPLOYEE_CODE_TAKEN:employee_code"])
    })
  })

  describe("positions", () => {
    const positions = [
      { id: "g", name: "Analyst", orgNodeId: null, isActive: true },
      { id: "s", name: "Analyst", orgNodeId: "eng", isActive: true },
      { id: "gone", name: "Boss", orgNodeId: null, isActive: false },
      { id: "ops-only", name: "Operator", orgNodeId: "ops", isActive: true },
    ]

    it("matches by normalised name, the scoped one beating the global one", () => {
      const p = plan(
        [row(2, { position: " ANALYST " }), row(3, { position: "analyst" }, ["Acme", "Ops"])],
        snap({ positions }),
      )
      expect(p.report.errors).toEqual([])
      expect(p.writes.newMembers.map((m) => m.positionId)).toEqual(["s", "g"])
    })

    it("does not find an inactive position or one scoped to another node", () => {
      const p = plan([row(2, { position: "Boss" }), row(3, { position: "Operator" })], snap({ positions }))
      expect(p.report.errors).toEqual([
        {
          row: 2,
          column: "position",
          code: "POSITION_NOT_FOUND",
          params: { name: "Boss" },
        },
        {
          row: 3,
          column: "position",
          code: "POSITION_NOT_FOUND",
          params: { name: "Operator" },
        },
      ])
    })

    it("lets a new node match only global positions", () => {
      const p = plan([row(2, { position: "Analyst" }, ["Acme", "Brand new"])], snap({ positions }))
      expect(p.writes.newMembers[0].positionId).toBe("g")
    })

    it("clears a position scoped to the old node on a move with an empty position", () => {
      const m = member("u1", { positionId: "s" })
      const p = plan([existing("u1", {}, ["Acme", "Ops"])], snap({ positions }, [m]))
      expect(p.report.warnings).toEqual([{ row: 2, column: "position", code: "POSITION_CLEARED" }])
      expect(p.writes.updates[0].profile).toEqual({
        orgNodeId: "ops",
        positionId: null,
        assignmentChangedAt: true,
      })
    })

    it("keeps a global position on a move and a scoped one when the node stays", () => {
      const global = plan(
        [existing("u1", {}, ["Acme", "Ops"])],
        snap({ positions }, [member("u1", { positionId: "g" })]),
      )
      expect(global.report.warnings).toEqual([])
      expect(global.writes.updates[0].profile).toEqual({
        orgNodeId: "ops",
        assignmentChangedAt: true,
      })
      const stay = plan([existing("u1")], snap({ positions }, [member("u1", { positionId: "s" })]))
      expect(stay.report.unchanged).toBe(1)
    })

    it("changing only the position marks the assignment as changed", () => {
      const p = plan(
        [existing("u1", { position: "Analyst" })],
        snap({ positions }, [member("u1", { positionId: "g" })]),
      )
      expect(p.writes.updates[0].profile).toEqual({
        positionId: "s",
        assignmentChangedAt: true,
      })
    })
  })

  describe("isolation", () => {
    it("requires a node for a new member and for an existing non-crosser, not for a crosser", () => {
      const s = snap({ isolated: true }, [
        member("u1", { orgNodeId: null }),
        member("u2", { orgNodeId: null, role: "MANAGER" }),
        member("u3", { orgNodeId: "eng" }),
      ])
      const rows = [
        row(2, {}, []),
        row(3, { email: "u1@x.com" }, []),
        row(4, { email: "u2@x.com" }, []),
        row(5, { email: "u3@x.com" }, []),
      ]
      expect(brief(plan(rows, s).report.errors)).toEqual(["2:NODE_REQUIRED:node_1", "3:NODE_REQUIRED:node_1"])
    })

    it("does not require a node when isolation is off", () => {
      expect(plan([row(2, {}, [])], snap()).report.errors).toEqual([])
    })

    it("warns PARTITION_CHANGED when an existing member moves to another main node", () => {
      const p = plan([existing("u1", {}, ["Globex", "Sales"])], snap({ isolated: true }, [member("u1")]))
      expect(p.report.errors).toEqual([])
      expect(p.report.warnings).toEqual([
        {
          row: 2,
          column: "node_1",
          code: "PARTITION_CHANGED",
          params: { from: "Acme", to: "Globex" },
        },
      ])
      const off = plan([existing("u1", {}, ["Globex", "Sales"])], snap({}, [member("u1")]))
      expect(off.report.warnings).toEqual([])
    })
  })

  describe("managers", () => {
    it("sets a manager of a node, also for a new member (its NewMember id)", () => {
      const p = plan([row(2, { isNodeManager: true })], snap())
      expect(p.writes.setManagers).toEqual([{ nodeId: "eng", userId: "new1" }])
      expect(p.writes.releaseManagers).toEqual([])
    })

    it("needs a node", () => {
      const p = plan([row(2, { isNodeManager: true }, [])], snap())
      expect(brief(p.report.errors)).toEqual(["2:NODE_REQUIRED:is_node_manager"])
    })

    it("refuses two managers for one node on both rows", () => {
      const p = plan([row(2, { isNodeManager: true }), row(3, { isNodeManager: true })], snap())
      expect(brief(p.report.errors)).toEqual([
        "2:MANAGER_DUPLICATE:is_node_manager",
        "3:MANAGER_DUPLICATE:is_node_manager",
      ])
    })

    it("replaces another manager with a warning and a report entry", () => {
      const s = snap({
        managerOf: new Map([["eng", "boss"]]),
        managerNames: new Map([["boss", "Old Boss"]]),
      })
      const p = plan([row(2, { isNodeManager: true, firstName: "New", lastName: "One" })], s)
      expect(p.writes.releaseManagers).toEqual(["eng"])
      expect(p.writes.setManagers).toEqual([{ nodeId: "eng", userId: "new1" }])
      expect(p.report.warnings).toEqual([
        {
          row: 2,
          column: "is_node_manager",
          code: "MANAGER_REPLACED",
          params: { node: "Eng", from: "Old Boss", to: "New One" },
        },
      ])
      expect(p.report.managersReplaced).toEqual([{ node: "Eng", from: "Old Boss", to: "New One" }])
    })

    it("releases the node a person managed when they become manager elsewhere", () => {
      const m = member("u1", { managesNodeId: "ops", orgNodeId: "ops" })
      const p = plan(
        [existing("u1", { isNodeManager: true }, ["Acme", "Eng"])],
        snap({ managerOf: new Map([["ops", "u1"]]) }, [m]),
      )
      expect(p.writes.releaseManagers).toEqual(["ops"])
      expect(p.writes.setManagers).toEqual([{ nodeId: "eng", userId: "u1" }])
      expect(p.report.warnings).toContainEqual({
        row: 2,
        column: "is_node_manager",
        code: "MANAGER_RELEASED",
        params: { node: "Ops" },
      })
    })

    it("does nothing for the person who already manages that node", () => {
      const m = member("u1", { managesNodeId: "eng" })
      const p = plan([existing("u1", { isNodeManager: true })], snap({ managerOf: new Map([["eng", "u1"]]) }, [m]))
      expect(p.report.unchanged).toBe(1)
      expect(p.writes.setManagers).toEqual([])
    })

    it("releases on `no` (a change, no warning) and ignores `no` for a non-manager", () => {
      const m = member("u1", { managesNodeId: "eng" })
      const p = plan([existing("u1", { isNodeManager: false })], snap({ managerOf: new Map([["eng", "u1"]]) }, [m]))
      expect(p.writes.releaseManagers).toEqual(["eng"])
      expect(p.report).toMatchObject({ update: 1, unchanged: 0, warnings: [] })
      expect(p.writes.updates).toEqual([])
      const none = plan([existing("u1", { isNodeManager: false })], snap({}, [member("u1")]))
      expect(none.report.unchanged).toBe(1)
    })

    describe("rule 8", () => {
      const moving = (m: MemberSnapshot, isolated: boolean, extra: Partial<ParsedRow> = {}) =>
        plan(
          [existing(m.id, extra, ["Globex", "Sales"])],
          snap({ isolated, managerOf: new Map([["eng", m.id]]) }, [{ ...m, managesNodeId: "eng" }]),
        )

      it("refuses moving a current manager to another main node while isolated", () => {
        expect(brief(moving(member("u1"), true).report.errors)).toEqual(["2:MANAGER_OTHER_PARTITION:node_1"])
      })

      it("allows it when not isolated, for a crosser, or when the file releases the node", () => {
        expect(moving(member("u1"), false).report.errors).toEqual([])
        expect(moving(member("u1", { role: "MANAGER" }), true).report.errors).toEqual([])
        expect(moving(member("u1", { capabilities: ["GROW_COURSE_MANAGE"] }), true).report.errors).toEqual([])
        expect(moving(member("u1"), true, { isNodeManager: false }).report.errors).toEqual([])
      })

      it("allows it when another row replaces them as manager of that node", () => {
        const m = member("u1", { managesNodeId: "eng" })
        const p = plan(
          [existing("u1", {}, ["Globex", "Sales"]), row(3, { isNodeManager: true })],
          snap({ isolated: true, managerOf: new Map([["eng", "u1"]]) }, [m]),
        )
        expect(p.report.errors).toEqual([])
      })

      it("allows a manager who stays inside their main node", () => {
        const m = member("u1", { managesNodeId: "eng" })
        const p = plan([existing("u1", {}, ["Acme", "Ops"])], snap({ isolated: true }, [m]))
        expect(p.report.errors).toEqual([])
      })
    })
  })

  describe("report", () => {
    it("counts only rows without errors and sorts issues by row then column", () => {
      const p = plan(
        [
          row(4, { firstName: null, lastName: null }),
          row(2, { position: "Nope", canCreateSpaces: true }),
          row(3),
          existing("u1", { entryDate: "2026-05-05" }),
        ].map((r, i) => ({ ...r, row: i + 2 })),
        snap({ knowEnabled: false }, [member("u1")]),
      )
      expect(brief(p.report.errors)).toEqual([
        "2:REQUIRED:first_name",
        "2:REQUIRED:last_name",
        "3:CAPABILITY_MODULE_OFF:can_create_spaces",
        "3:POSITION_NOT_FOUND:position",
      ])
      expect(p.report).toMatchObject({
        rows: 4,
        create: 1,
        update: 1,
        unchanged: 0,
      })
      expect(p.writes.newMembers.map((m) => m.row)).toEqual([4])
    })
  })
})
