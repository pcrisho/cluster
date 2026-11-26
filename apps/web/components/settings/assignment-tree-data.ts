import type { FullOrgChartData } from "@/hooks/use-full-org-chart"
import { byOrder } from "@/lib/area-drop"
import type { OrgTreeNode } from "@/components/settings/assignment-tree-rows"

export function buildOrgTree(flat: FullOrgChartData["nodes"]): OrgTreeNode[] {
  const map = new Map<string, OrgTreeNode>()
  for (const n of flat) {
    map.set(n.id, { ...n, children: [] })
  }
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      const parent = map.get(item.parentId)!
      parent.children.push(item)
    }
  }
  const roots = Array.from(map.values()).filter((n) => !n.parentId)
  const sortRecursive = (nodes: OrgTreeNode[]) => {
    nodes.sort(byOrder)
    for (const n of nodes) sortRecursive(n.children)
  }
  sortRecursive(roots)
  return roots
}

/**
 * Return a sub-tree containing only nodes whose id is in
 * `visibleIds`. Children are recursively filtered. Returns
 * `null` if the node itself is not visible AND has no visible
 * descendants.
 */
export function filterSubtree(
  node: OrgTreeNode,
  visibleIds: Set<string>
): OrgTreeNode | null {
  const children = node.children
    .map((c) => filterSubtree(c, visibleIds))
    .filter((c): c is OrgTreeNode => c !== null)
  if (!visibleIds.has(node.id) && children.length === 0) return null
  return { ...node, children }
}

/**
 * Recursively collect every node id in the tree into `set`.
 */
export function collectIds(node: OrgTreeNode, set: Set<string>) {
  set.add(node.id)
  for (const child of node.children) collectIds(child, set)
}
