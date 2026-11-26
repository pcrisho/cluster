import type { PageTreeNode } from "@/lib/know-api"

export interface TreeNode extends PageTreeNode {
  children: TreeNode[]
}

/** Roots first, siblings in the order the API sends them (position, then newest). */
export function buildTree(pages: PageTreeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(
    pages.map((p) => [p.id, { ...p, children: [] }])
  )
  const roots: TreeNode[] = []
  for (const page of pages) {
    const node = byId.get(page.id)!
    const parent = page.parentId ? byId.get(page.parentId) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  return roots
}

export type MoveAction = "up" | "down" | "indent" | "outdent"

export interface MoveTarget {
  parentId: string | null
  index: number
}

/**
 * Where a page lands for a tree-editor action, or null when it cannot move that way:
 * up/down swap with a sibling, indent makes it the last child of the sibling above,
 * outdent puts it right after its parent.
 */
export function planMove(
  roots: TreeNode[],
  id: string,
  action: MoveAction
): MoveTarget | null {
  const found = locate(roots, id, null, roots)
  if (!found) return null
  const { siblings, index, parent, grandSiblings } = found

  switch (action) {
    case "up":
      return index > 0
        ? { parentId: parent?.id ?? null, index: index - 1 }
        : null
    case "down":
      return index < siblings.length - 1
        ? { parentId: parent?.id ?? null, index: index + 1 }
        : null
    case "indent": {
      const above = siblings[index - 1]
      return above ? { parentId: above.id, index: above.children.length } : null
    }
    case "outdent": {
      if (!parent) return null
      const at = grandSiblings.findIndex((n) => n.id === parent.id)
      return { parentId: parent.parentId, index: at + 1 }
    }
  }
}

export type DropZone = "before" | "after" | "inside"

/**
 * Where a dragged page lands when dropped on `overId`: just before or after it among its
 * siblings, or as its last child. Null for a drop that changes nothing or would nest a page
 * under itself or its own descendants. `index` ignores the dragged page, as the API does.
 */
export function planDrop(
  roots: TreeNode[],
  dragId: string,
  overId: string,
  zone: DropZone
): MoveTarget | null {
  const dragged = locate(roots, dragId, null, roots)
  const over = locate(roots, overId, null, roots)
  if (!dragged || !over || dragId === overId) return null
  const self = dragged.siblings[dragged.index]
  if (locate(self.children, overId, self, self.children)) return null

  const without = (nodes: TreeNode[]) => nodes.filter((n) => n.id !== dragId)
  const target: MoveTarget =
    zone === "inside"
      ? {
          parentId: overId,
          index: without(over.siblings[over.index].children).length,
        }
      : {
          parentId: over.parent?.id ?? null,
          index:
            without(over.siblings).findIndex((n) => n.id === overId) +
            (zone === "after" ? 1 : 0),
        }

  const unchanged =
    target.parentId === (dragged.parent?.id ?? null) &&
    target.index === dragged.index
  return unchanged ? null : target
}

interface Located {
  siblings: TreeNode[]
  index: number
  parent: TreeNode | null
  grandSiblings: TreeNode[]
}

function locate(
  siblings: TreeNode[],
  id: string,
  parent: TreeNode | null,
  grandSiblings: TreeNode[]
): Located | null {
  const index = siblings.findIndex((n) => n.id === id)
  if (index >= 0) return { siblings, index, parent, grandSiblings }
  for (const node of siblings) {
    const hit = locate(node.children, id, node, siblings)
    if (hit) return hit
  }
  return null
}

/** The ids of every page above `id`, nearest first; used to open the branch that holds the current page. */
export function ancestorIds(pages: PageTreeNode[], id: string): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const out: string[] = []
  const seen = new Set<string>([id])
  let cursor = byId.get(id)?.parentId ?? null
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    out.push(cursor)
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return out
}
