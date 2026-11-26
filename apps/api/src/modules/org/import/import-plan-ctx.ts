import type {
  ImportColumn,
  ImportIssue,
  ImportSnapshot,
  MemberSnapshot,
  MemberUpdate,
  NewMember,
  ParsedRow,
  PathResult,
} from "./import-types"

/** What the planner knows about one row once the person and the node are settled. */
export interface Entry {
  row: ParsedRow
  userId: string
  member: MemberSnapshot | null
  /** The node the row names (new or existing), else the member's current one. */
  node: string | null
  /** False when the path matcher refused the row's node cells (the error is already reported). */
  nodeOk: boolean
  newMember: NewMember | null
  update: MemberUpdate | null
  /** An existing member something changes for, the manager flag included. */
  changed: boolean
}

export interface Ctx {
  snap: ImportSnapshot
  paths: PathResult
  newId: () => string
  errors: ImportIssue[]
  warnings: ImportIssue[]
  parentOf: Map<string, string | null>
  names: Map<string, string>
  newNodeIds: Set<string>
  codesInFile: Set<string>
}

export function add(
  list: ImportIssue[],
  row: number,
  code: string,
  column?: ImportColumn,
  params?: Record<string, string | number>,
) {
  list.push({
    row,
    ...(column && { column }),
    code,
    ...(params && { params }),
  })
}

export const byRowThenColumn = (a: ImportIssue, b: ImportIssue) =>
  a.row - b.row || (a.column ?? "").localeCompare(b.column ?? "")

export const nameOf = (ctx: Ctx, id: string | null) => (id ? (ctx.names.get(id) ?? "") : "")
