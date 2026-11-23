import { isCrosser, mainNodeOf } from "../partition"
import { normalizeName } from "./import-names"
import { checkManagersStay, planManagers } from "./import-plan-managers"
import { add, byRowThenColumn, nameOf } from "./import-plan-ctx"
import type { Ctx, Entry } from "./import-plan-ctx"
import { matchPaths } from "./import-paths"
import type { ImportPlan, ImportSnapshot, MemberSnapshot, MemberUpdate, ParsedRow, ParseResult } from "./import-types"

/** The two capabilities a file may grant or take away (never a role, never GROW_COURSE_MANAGE). */
const CAPABILITY_COLUMNS = [
  {
    field: "canCreateSpaces",
    column: "can_create_spaces",
    capability: "KNOW_SPACE_CREATE",
  },
  {
    field: "canDeleteSpaces",
    column: "can_delete_spaces",
    capability: "KNOW_SPACE_DELETE",
  },
] as const

/** An active position called `name`: one scoped to exactly this node first, then a global one (a new node has only global). */
function findPosition(ctx: Ctx, name: string, node: string | null) {
  const key = normalizeName(name)
  const named = ctx.snap.positions.filter((p) => p.isActive && normalizeName(p.name) === key)
  const scoped = node && !ctx.newNodeIds.has(node) ? named.find((p) => p.orgNodeId === node) : undefined
  return scoped ?? named.find((p) => p.orgNodeId === null)
}

/** The row's position: an id, null (cleared), or undefined (keep). */
function resolvePosition(ctx: Ctx, e: Entry): string | null | undefined {
  const { row, member, node } = e
  if (row.position !== null) {
    const found = findPosition(ctx, row.position, node)
    if (!found)
      add(ctx.errors, row.row, "POSITION_NOT_FOUND", "position", {
        name: row.position,
      })
    return found?.id
  }
  if (member && node !== member.orgNodeId) {
    const current = ctx.snap.positions.find((p) => p.id === member.positionId)
    if (current?.orgNodeId && current.orgNodeId !== node) {
      add(ctx.warnings, row.row, "POSITION_CLEARED", "position")
      return null
    }
  }
  return undefined
}

function checkEmployeeCode(ctx: Ctx, e: Entry) {
  const code = e.row.employeeCode
  if (code === null) return
  const holder = ctx.snap.employeeCodes.get(code)
  if (ctx.codesInFile.has(code) || (holder !== undefined && holder !== e.userId))
    add(ctx.errors, e.row.row, "EMPLOYEE_CODE_TAKEN", "employee_code")
  ctx.codesInFile.add(code)
}

/** Capabilities to add and remove; `yes` while KNOW is off is an error. */
function capabilityDelta(ctx: Ctx, e: Entry) {
  const delta = { add: [] as string[], remove: [] as string[] }
  for (const { field, column, capability } of CAPABILITY_COLUMNS) {
    const wanted = e.row[field]
    if (wanted === null) continue
    if (wanted && !ctx.snap.knowEnabled) {
      add(ctx.errors, e.row.row, "CAPABILITY_MODULE_OFF", column)
      continue
    }
    const has = e.member?.capabilities.includes(capability) ?? false
    if (wanted && !has) delta.add.push(capability)
    if (!wanted && has) delta.remove.push(capability)
  }
  return delta
}

function checkPartitionAndNode(ctx: Ctx, e: Entry) {
  const { snap } = ctx
  if (!snap.isolated || !e.nodeOk) return
  if (!e.node && (!e.member || !isCrosser(e.member))) add(ctx.errors, e.row.row, "NODE_REQUIRED", "node_1")
  const from = mainNodeOf(e.member?.orgNodeId ?? null, ctx.parentOf)
  const to = mainNodeOf(e.node, ctx.parentOf)
  if (e.member && from && to && from !== to)
    add(ctx.warnings, e.row.row, "PARTITION_CHANGED", "node_1", {
      from: nameOf(ctx, from),
      to: nameOf(ctx, to),
    })
}

function planNewMember(ctx: Ctx, e: Entry) {
  const { row } = e
  if (row.firstName === null) add(ctx.errors, row.row, "REQUIRED", "first_name")
  if (row.lastName === null) add(ctx.errors, row.row, "REQUIRED", "last_name")
  const positionId = resolvePosition(ctx, e) ?? null
  e.newMember = {
    id: e.userId,
    row: row.row,
    email: row.email as string,
    firstName: row.firstName ?? "",
    lastName: row.lastName ?? "",
    employeeCode: row.employeeCode,
    orgNodeId: e.node,
    positionId,
    joinedAt: row.entryDate,
    capabilities: capabilityDelta(ctx, e).add,
  }
}

/** Only the changed columns; an empty cell keeps the value. */
function planUpdate(ctx: Ctx, e: Entry, member: MemberSnapshot) {
  const { row } = e
  const user: MemberUpdate["user"] = {}
  if (row.firstName !== null && row.firstName !== member.firstName) user.firstName = row.firstName
  if (row.lastName !== null && row.lastName !== member.lastName) user.lastName = row.lastName
  if (row.employeeCode !== null && row.employeeCode !== member.employeeCode) user.orgColaboratorId = row.employeeCode

  const profile: MemberUpdate["profile"] = {}
  if (e.nodeOk && e.node !== member.orgNodeId) profile.orgNodeId = e.node
  const positionId = resolvePosition(ctx, e)
  if (positionId !== undefined && positionId !== member.positionId) profile.positionId = positionId
  if (row.entryDate !== null && row.entryDate !== member.joinedAt) profile.joinedAt = row.entryDate
  if ("orgNodeId" in profile || "positionId" in profile) profile.assignmentChangedAt = true

  const capabilities = capabilityDelta(ctx, e)
  e.changed =
    Object.keys(user).length > 0 ||
    Object.keys(profile).length > 0 ||
    capabilities.add.length + capabilities.remove.length > 0
  if (e.changed) e.update = { userId: member.id, row: row.row, user, profile, capabilities }
}

function planRow(ctx: Ctx, row: ParsedRow): Entry | null {
  const { snap, paths } = ctx
  if (row.email === null) return null
  if (snap.emailsElsewhere.has(row.email)) {
    add(ctx.errors, row.row, "EMAIL_UNAVAILABLE", "email")
    return null
  }
  const member = snap.members.get(row.email) ?? null
  if (member && !member.isActive) {
    add(ctx.errors, row.row, "MEMBER_INACTIVE", "email")
    return null
  }
  if (member?.isSuperAdmin) {
    add(ctx.errors, row.row, "SUPERADMIN_PROTECTED", "email")
    return null
  }
  const e: Entry = {
    row,
    userId: member?.id ?? ctx.newId(),
    member,
    node: paths.nodeOfRow.get(row.row) ?? member?.orgNodeId ?? null,
    nodeOk: paths.nodeOfRow.has(row.row),
    newMember: null,
    update: null,
    changed: false,
  }
  checkPartitionAndNode(ctx, e)
  checkEmployeeCode(ctx, e)
  if (member) planUpdate(ctx, e, member)
  else planNewMember(ctx, e)
  return e
}

/** Decides every row of the file against the organization's current data; pure, no I/O. */
export function planImport(parsed: ParseResult, snapshot: ImportSnapshot, opts: { newId: () => string }): ImportPlan {
  const paths = matchPaths(parsed.rows, snapshot.tree, {
    isolated: false,
    newId: opts.newId,
  })
  const nodes = [...snapshot.tree, ...paths.newNodes]
  const ctx: Ctx = {
    snap: snapshot,
    paths,
    newId: opts.newId,
    errors: [...parsed.errors, ...paths.errors],
    warnings: [...paths.warnings],
    parentOf: new Map(nodes.map((n) => [n.id, n.parentId])),
    names: new Map(nodes.map((n) => [n.id, n.name])),
    newNodeIds: new Set(paths.newNodes.map((n) => n.id)),
    codesInFile: new Set(),
  }
  const report: ImportPlan["report"] = {
    rows: parsed.rows.length,
    create: 0,
    update: 0,
    unchanged: 0,
    nodesToCreate: paths.newNodes.map((n) => n.path),
    managersReplaced: [],
    errors: ctx.errors,
    warnings: ctx.warnings,
  }

  const entries = parsed.rows.flatMap((row) => planRow(ctx, row) ?? [])
  const { releases, sets } = planManagers(ctx, entries, report)
  checkManagersStay(ctx, entries, releases)

  const bad = new Set(ctx.errors.map((i) => i.row))
  const writes: ImportPlan["writes"] = {
    newNodes: paths.newNodes,
    releaseManagers: [...releases].filter(([, row]) => !bad.has(row)).map(([node]) => node),
    newMembers: [],
    updates: [],
    setManagers: sets.filter((s) => !bad.has(s.row)).map(({ nodeId, userId }) => ({ nodeId, userId })),
  }
  for (const e of entries) {
    if (bad.has(e.row.row)) continue
    if (!e.member && e.newMember) {
      report.create++
      writes.newMembers.push(e.newMember)
    } else if (e.changed) {
      report.update++
      if (e.update) writes.updates.push(e.update)
    } else {
      report.unchanged++
      add(ctx.warnings, e.row.row, "NO_CHANGES")
    }
  }
  ctx.errors.sort(byRowThenColumn)
  ctx.warnings.sort(byRowThenColumn)
  return { report, writes }
}
