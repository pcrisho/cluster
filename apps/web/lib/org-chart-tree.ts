/** What the org chart needs from an area; `OrgNode` fits. */
export interface ChartArea {
  id: string
  parentId: string | null
  _count: { profiles: number }
}

function childrenOf(areas: ChartArea[]): Map<string | null, ChartArea[]> {
  const map = new Map<string | null, ChartArea[]>()
  for (const a of areas)
    map.set(a.parentId, [...(map.get(a.parentId) ?? []), a])
  return map
}

/** An area and every area under it. A cycle (not allowed by the API) cannot loop: each id is visited once. */
export function subtreeIds(areas: ChartArea[], id: string): string[] {
  const children = childrenOf(areas)
  const seen = new Set<string>()
  const walk = (areaId: string) => {
    if (seen.has(areaId)) return
    seen.add(areaId)
    for (const c of children.get(areaId) ?? []) walk(c.id)
  }
  walk(id)
  return [...seen]
}

/** Members of each area plus those of every area under it. */
export function subtreeMemberCounts(areas: ChartArea[]): Map<string, number> {
  const own = new Map(areas.map((a) => [a.id, a._count.profiles]))
  return new Map(
    areas.map((a) => [
      a.id,
      subtreeIds(areas, a.id).reduce((sum, id) => sum + (own.get(id) ?? 0), 0),
    ])
  )
}

/** Areas with children that start collapsed: everything from `openDepth` down (roots are depth 0). */
export function defaultCollapsed(
  areas: ChartArea[],
  openDepth = 1
): Set<string> {
  const children = childrenOf(areas)
  const collapsed = new Set<string>()
  const walk = (a: ChartArea, depth: number) => {
    const kids = children.get(a.id) ?? []
    if (kids.length && depth >= openDepth) collapsed.add(a.id)
    else kids.forEach((k) => walk(k, depth + 1))
  }
  for (const root of areas.filter(
    (a) => !a.parentId || !areas.some((p) => p.id === a.parentId)
  ))
    walk(root, 0)
  return collapsed
}

/** The areas on screen: everything except what sits under a collapsed area. */
export function visibleAreas<T extends ChartArea>(
  areas: T[],
  collapsed: Set<string>
): T[] {
  const byId = new Map(areas.map((a) => [a.id, a]))
  const hidden = (a: T): boolean => {
    const seen = new Set<string>()
    for (
      let p = a.parentId;
      p && !seen.has(p);
      p = byId.get(p)?.parentId ?? null
    ) {
      if (collapsed.has(p)) return true
      seen.add(p)
    }
    return false
  }
  return areas.filter((a) => !hidden(a))
}
