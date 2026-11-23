/** Shared contract of the bulk import (docs/specs/org/bulk-import). Pure types and constants only. */

export const NODE_COLUMNS = ["node_1", "node_2", "node_3", "node_4", "node_5", "node_6"] as const

/** Fixed English headers, in template order. */
export const IMPORT_COLUMNS = [
  ...NODE_COLUMNS,
  "node_1_code",
  "first_name",
  "last_name",
  "email",
  "employee_code",
  "position",
  "is_node_manager",
  "entry_date",
  "can_create_spaces",
  "can_delete_spaces",
] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** Headers that must be present in the file (the cells may still be empty on some rows). */
export const REQUIRED_HEADERS: readonly ImportColumn[] = ["node_1", "first_name", "last_name", "email"]

export const MAX_ROWS = 2000
export const MAX_COLUMNS = 30
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** A cell as read from the workbook: formulas give their result, hyperlinks and rich text their plain text. */
export type Cell = string | number | boolean | Date | null

export interface SheetRow {
  /** Row number in the spreadsheet (the header is row 1). */
  row: number
  /** Cells keyed by header, lower-cased and trimmed. */
  cells: Record<string, Cell>
}

export interface Sheet {
  headers: string[]
  rows: SheetRow[]
}

/** One problem in the report; `code` is translated by the web, `params` fill its message. */
export interface ImportIssue {
  row: number
  column?: ImportColumn
  code: string
  params?: Record<string, string | number>
}

/** A problem with the whole file: answered as 400 with `code`, before any row is planned. */
export class ImportFileError extends Error {
  constructor(
    readonly code: "IMPORT_TOO_LARGE" | "IMPORT_UNREADABLE" | "IMPORT_HEADERS",
    readonly params: Record<string, string | number> = {},
  ) {
    super(code)
  }
}

/** A typed row. `null` = empty cell (no change on an existing member). */
export interface ParsedRow {
  row: number
  /** `node_1` … `node_6`, trimmed as written, `""` when empty; always length 6. */
  nodes: string[]
  /** `node_1_code`, trimmed and upper-cased. */
  nodeCode: string | null
  firstName: string | null
  lastName: string | null
  /** Lower-cased; `null` when empty or invalid (the parser reports which). */
  email: string | null
  employeeCode: string | null
  position: string | null
  isNodeManager: boolean | null
  /** `YYYY-MM-DD`. */
  entryDate: string | null
  canCreateSpaces: boolean | null
  canDeleteSpaces: boolean | null
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: ImportIssue[]
}

/** A node of the organization's tree as the path matcher sees it (archived ones included). */
export interface TreeNode {
  id: string
  parentId: string | null
  name: string
  code: string | null
  isActive: boolean
}

/** A node the file will create; listed parents first. */
export interface NewNode {
  id: string
  parentId: string | null
  name: string
  code: string | null
  /** Names from the main node down to this node, for the report. */
  path: string[]
}

export interface PathResult {
  /** Leaf node of each row: an existing or new node id, `null` when the row names no node. Rows with a node error are absent. */
  nodeOfRow: Map<number, string | null>
  newNodes: NewNode[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

// ── Planner (T4) ──────────────────────────────────────────────────────────────

/** A member of this organization whose e-mail is in the file. */
export interface MemberSnapshot {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  isSuperAdmin: boolean
  isActive: boolean
  employeeCode: string | null
  orgNodeId: string | null
  positionId: string | null
  /** `YYYY-MM-DD`, `null` without a profile. */
  joinedAt: string | null
  capabilities: string[]
  /** The node this member manages, if any (one at most). */
  managesNodeId: string | null
}

export interface PositionSnapshot {
  id: string
  name: string
  orgNodeId: string | null
  isActive: boolean
}

/** Everything the planner reads, loaded by the service in the ADMIN's organization. */
export interface ImportSnapshot {
  tree: TreeNode[]
  /** Live node id → its manager's user id. */
  managerOf: Map<string, string>
  /** Display names of current managers (user id → "First Last"), for the report. */
  managerNames: Map<string, string>
  positions: PositionSnapshot[]
  /** Members of this organization by lower-cased e-mail (only the file's addresses). */
  members: Map<string, MemberSnapshot>
  /** Employee code → user id, for the whole organization. */
  employeeCodes: Map<string, string>
  /** File addresses that belong to another organization. */
  emailsElsewhere: Set<string>
  isolated: boolean
  /** KNOW enabled in the organization (the two space capabilities need it). */
  knowEnabled: boolean
}

export interface ImportReport {
  rows: number
  create: number
  update: number
  unchanged: number
  nodesToCreate: string[][]
  managersReplaced: { node: string; from: string; to: string }[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

export interface NewMember {
  id: string
  row: number
  email: string
  firstName: string
  lastName: string
  employeeCode: string | null
  orgNodeId: string | null
  positionId: string | null
  joinedAt: string | null
  capabilities: string[]
}

export interface MemberUpdate {
  userId: string
  row: number
  /** Only the changed columns. */
  user: { firstName?: string; lastName?: string; orgColaboratorId?: string }
  /** Only the changed columns; the profile is created when missing. `assignmentChangedAt` = node or position really changed. */
  profile: { orgNodeId?: string | null; positionId?: string | null; joinedAt?: string; assignmentChangedAt?: true }
  capabilities: { add: string[]; remove: string[] }
}

export interface ImportWrites {
  newNodes: NewNode[]
  /** Nodes left without manager (released or replaced), applied before `setManagers`. */
  releaseManagers: string[]
  newMembers: NewMember[]
  updates: MemberUpdate[]
  setManagers: { nodeId: string; userId: string }[]
}

export interface ImportPlan {
  report: ImportReport
  writes: ImportWrites
}
