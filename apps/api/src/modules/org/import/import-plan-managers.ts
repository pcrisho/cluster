import { isCrosser, mainNodeOf } from "../partition"
import { add, nameOf } from "./import-plan-ctx"
import type { Ctx, Entry } from "./import-plan-ctx"
import type { ImportPlan } from "./import-types"

/** Manager flags: `yes` takes a node (releasing the previous holder and the person's old node), `no` releases. */
export function planManagers(ctx: Ctx, entries: Entry[], report: ImportPlan["report"]) {
  const releases = new Map<string, number>()
  const sets: (ImportPlan["writes"]["setManagers"][number] & {
    row: number
  })[] = []
  const wanting = new Map<string, Entry[]>()
  for (const e of entries) {
    if (e.row.isNodeManager === true) {
      if (e.node) wanting.set(e.node, [...(wanting.get(e.node) ?? []), e])
      else if (e.nodeOk) add(ctx.errors, e.row.row, "NODE_REQUIRED", "is_node_manager")
    } else if (e.row.isNodeManager === false && e.member?.managesNodeId) {
      releases.set(e.member.managesNodeId, e.row.row)
      e.changed = true
    }
  }
  for (const [node, group] of wanting) {
    if (group.length > 1) {
      for (const e of group) add(ctx.errors, e.row.row, "MANAGER_DUPLICATE", "is_node_manager")
      continue
    }
    const [e] = group
    const current = ctx.snap.managerOf.get(node)
    const owned = e.member?.managesNodeId ?? null
    if (current && current !== e.userId) {
      const to = `${e.row.firstName ?? e.member?.firstName ?? ""} ${e.row.lastName ?? e.member?.lastName ?? ""}`.trim()
      const from = ctx.snap.managerNames.get(current) ?? ""
      releases.set(node, e.row.row)
      add(ctx.warnings, e.row.row, "MANAGER_REPLACED", "is_node_manager", {
        node: nameOf(ctx, node),
        from,
        to,
      })
      report.managersReplaced.push({ node: nameOf(ctx, node), from, to })
      e.changed = true
    }
    if (owned && owned !== node) {
      releases.set(owned, e.row.row)
      add(ctx.warnings, e.row.row, "MANAGER_RELEASED", "is_node_manager", {
        node: nameOf(ctx, owned),
      })
      e.changed = true
    }
    if (owned !== node) {
      sets.push({ nodeId: node, userId: e.userId, row: e.row.row })
      e.changed = true
    }
  }
  return { releases, sets }
}

/** Rule 8: while isolated, a manager who keeps their node cannot move to another main node (crossers can). */
export function checkManagersStay(ctx: Ctx, entries: Entry[], released: Map<string, number>) {
  if (!ctx.snap.isolated) return
  for (const e of entries) {
    const { member } = e
    const kept = member?.managesNodeId
    if (!member || !kept || released.has(kept) || isCrosser(member) || !e.nodeOk || !e.node) continue
    if (e.node !== member.orgNodeId && mainNodeOf(e.node, ctx.parentOf) !== mainNodeOf(kept, ctx.parentOf))
      add(ctx.errors, e.row.row, "MANAGER_OTHER_PARTITION", "node_1")
  }
}
