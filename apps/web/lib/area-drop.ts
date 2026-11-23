import type { DropZone } from "./tree-dnd"

/** Mirrors `MAX_DEPTH` in the API's `org-node.service.ts`; the server stays the one that enforces it. */
export const MAX_AREA_DEPTH = 6

export interface AreaNode {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
}

/** Where an area goes: under `parentId` (null = top level), before the sibling `beforeId` (null = last). */
export interface Placement {
  parentId: string | null
  beforeId: string | null
}

export type DropRefusal = "cycle" | "depth" | "duplicate"

export type Resolution =
  | { kind: "ok"; zone: DropZone; placement: Placement }
  | { kind: "same" }
  | { kind: "refused"; reason: DropRefusal }

// One collator: `localeCompare` builds a new one on every call, which shows with hundreds of areas.
const collator = new Intl.Collator()

/** Display order of sibling areas. */
export function byOrder(a: AreaNode, b: AreaNode) {
  return a.sortOrder - b.sortOrder || collator.compare(a.name, b.name)
}

/** The areas looked up once, so a drag can ask about them on every move without sorting or scanning. */
export interface AreaIndex<T extends AreaNode = AreaNode> {
  byId: Map<string, T>
  /** Active children of each parent (null = top level), in display order. */
  children: Map<string | null, T[]>
}

export function indexAreas<T extends AreaNode>(
  nodes: readonly T[]
): AreaIndex<T> {
  const byId = new Map<string, T>()
  const children = new Map<string | null, T[]>()
  for (const n of nodes) {
    byId.set(n.id, n)
    if (!n.isActive) continue
    const list = children.get(n.parentId)
    if (list) list.push(n)
    else children.set(n.parentId, [n])
  }
  for (const list of children.values()) list.sort(byOrder)
  return { byId, children }
}

const NONE: readonly AreaNode[] = []
const kids = (index: AreaIndex, parentId: string | null) =>
  index.children.get(parentId) ?? NONE

/** Where `id` is now. */
export function placementOf(index: AreaIndex, id: string): Placement {
  const parentId = index.byId.get(id)?.parentId ?? null
  const siblings = kids(index, parentId)
  const at = siblings.findIndex((n) => n.id === id)
  return { parentId, beforeId: siblings[at + 1]?.id ?? null }
}

function isInside(index: AreaIndex, id: string, ancestorId: string): boolean {
  const seen = new Set<string>()
  for (
    let cur = index.byId.get(id)?.parentId;
    cur && !seen.has(cur);
    cur = index.byId.get(cur)?.parentId
  ) {
    if (cur === ancestorId) return true
    seen.add(cur)
  }
  return false
}

function levelOf(index: AreaIndex, id: string | null): number {
  let level = 0
  const seen = new Set<string>()
  for (
    let cur = id;
    cur && !seen.has(cur);
    cur = index.byId.get(cur)?.parentId ?? null
  ) {
    seen.add(cur)
    level += 1
  }
  return level
}

function heightOf(index: AreaIndex, id: string): number {
  return 1 + Math.max(0, ...kids(index, id).map((c) => heightOf(index, c.id)))
}

/**
 * What dropping `activeId` on the `zone` of `targetId` would do. The lower third of an
 * open area with children goes inside it, first, so the line never points past a subtree.
 */
export function resolveDrop(
  index: AreaIndex,
  activeId: string,
  targetId: string,
  zone: DropZone,
  isOpen: (id: string) => boolean
): Resolution {
  const target = index.byId.get(targetId)
  const active = index.byId.get(activeId)
  if (!target || !active || targetId === activeId) return { kind: "same" }
  if (isInside(index, targetId, activeId))
    return { kind: "refused", reason: "cycle" }

  const others = (parentId: string | null) =>
    kids(index, parentId).filter((n) => n.id !== activeId)
  let placement: Placement
  let shown = zone
  const inside = zone === "after" && isOpen(target.id) ? others(target.id) : []
  if (zone === "inside") {
    placement = { parentId: target.id, beforeId: null }
  } else if (inside.length > 0) {
    placement = { parentId: target.id, beforeId: inside[0].id }
    shown = "inside"
  } else if (zone === "before") {
    placement = { parentId: target.parentId, beforeId: target.id }
  } else {
    const siblings = others(target.parentId)
    const at = siblings.findIndex((n) => n.id === target.id)
    placement = {
      parentId: target.parentId,
      beforeId: siblings[at + 1]?.id ?? null,
    }
  }

  const now = placementOf(index, activeId)
  if (
    placement.parentId === now.parentId &&
    placement.beforeId === now.beforeId
  )
    return { kind: "same" }

  if (placement.parentId !== active.parentId) {
    if (
      placement.parentId &&
      levelOf(index, placement.parentId) + heightOf(index, activeId) >
        MAX_AREA_DEPTH
    )
      return { kind: "refused", reason: "depth" }
    const name = active.name.trim().toLowerCase()
    if (
      others(placement.parentId).some(
        (n) => n.name.trim().toLowerCase() === name
      )
    )
      return { kind: "refused", reason: "duplicate" }
  }
  return { kind: "ok", zone: shown, placement }
}

/** The same renumbering the server does, to show the move before it answers. */
export function applyPlacement<T extends AreaNode>(
  nodes: readonly T[],
  id: string,
  placement: Placement
): T[] {
  const siblings = kids(indexAreas(nodes), placement.parentId)
    .filter((n) => n.id !== id)
    .map((n) => n.id)
  const at = placement.beforeId ? siblings.indexOf(placement.beforeId) : -1
  siblings.splice(at === -1 ? siblings.length : at, 0, id)
  const order = new Map(siblings.map((s, i) => [s, (i + 1) * 10]))
  return nodes.map((n) =>
    n.id === id
      ? { ...n, parentId: placement.parentId, sortOrder: order.get(id)! }
      : order.has(n.id)
        ? { ...n, sortOrder: order.get(n.id)! }
        : n
  )
}
