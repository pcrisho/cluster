const STORAGE_KEY = "cluster.recentPages"
const MAX_RECENT = 5
const UPDATE_EVENT = "cluster:recent-pages-updated"

export interface RecentPage {
  id: string
  title: string
  spaceId: string
  spaceName: string
  spaceIcon?: string
  visitedAt: string
}

export function getRecentPages(): RecentPage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is RecentPage =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as RecentPage).id === "string" &&
        typeof (p as RecentPage).title === "string" &&
        typeof (p as RecentPage).spaceId === "string"
    )
  } catch {
    return []
  }
}

export function addRecentPage(
  page: Omit<RecentPage, "visitedAt">
): RecentPage[] {
  if (typeof window === "undefined") return []
  try {
    const current = getRecentPages().filter((p) => p.id !== page.id)
    const next: RecentPage[] = [
      { ...page, visitedAt: new Date().toISOString() },
      ...current,
    ].slice(0, MAX_RECENT)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
    return next
  } catch {
    return []
  }
}

export function clearRecentPages(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
  } catch {
    // silent
  }
}

export function subscribeRecentPages(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => callback()
  window.addEventListener(UPDATE_EVENT, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(UPDATE_EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}
