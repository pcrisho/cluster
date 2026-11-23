import { mainNodeOf, subtreeIds } from "./partition"

/** An area as `GET /org/areas/full` lists it (active areas only; `_count.profiles` counts active people). */
export interface FlatArea {
  id: string
  parentId: string | null
  name: string
  _count: { profiles: number }
}

/** What an admin is about to do: move a person, move an area under a parent (null = top level), or archive an area into another. */
export type PartitionMove =
  | { kind: "person"; fromNodeId: string | null; toNodeId: string | null }
  | { kind: "area"; nodeId: string; newParentId: string | null }
  | { kind: "archive"; nodeId: string; reassignTo: string }

/** How many people change main node, and the main node they land in (null = they lose theirs). */
export interface PartitionChange {
  count: number
  targetMainNodeName: string | null
}

/**
 * The people whose main node changes with this move, or null when nothing changes (not isolated,
 * same main node, or nobody to move). Spec: docs/specs/org/node-partitions, rule 9.
 */
export function peopleMovingPartition(
  nodes: readonly FlatArea[],
  move: PartitionMove,
  isolated: boolean
): PartitionChange | null {
  if (!isolated) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = children.get(n.parentId)
    if (list) list.push(n.id)
    else children.set(n.parentId, [n.id])
  }
  const peopleBelow = (nodeId: string) => {
    let total = 0
    for (const id of subtreeIds(nodeId, children))
      total += byId.get(id)?._count.profiles ?? 0
    return total
  }

  let from: string | null
  let to: string | null
  let count: number
  switch (move.kind) {
    case "person":
      from = mainNodeOf(move.fromNodeId, parentOf)
      to = mainNodeOf(move.toNodeId, parentOf)
      count = 1
      break
    case "area":
      from = mainNodeOf(move.nodeId, parentOf)
      // Moved to the top level, the area is its own main node.
      to = move.newParentId
        ? mainNodeOf(move.newParentId, parentOf)
        : move.nodeId
      count = peopleBelow(move.nodeId)
      break
    case "archive":
      from = mainNodeOf(move.nodeId, parentOf)
      to = mainNodeOf(move.reassignTo, parentOf)
      count = byId.get(move.nodeId)?._count.profiles ?? 0
      break
  }
  if (from === to || count === 0) return null
  return { count, targetMainNodeName: to ? (byId.get(to)?.name ?? null) : null }
}
