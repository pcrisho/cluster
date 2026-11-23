import * as React from "react"

const MOBILE_BREAKPOINT = 768

const mql =
  typeof window !== "undefined"
    ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    : null

function subscribe(callback: () => void): () => void {
  if (!mql) return () => {}
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Subscribes to the (max-width: 767px) media query. Uses
 * useSyncExternalStore so the value is read synchronously during
 * render and updates trigger a re-render via the store's listener
 * model — no setState-in-effect needed.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const queries = new Map<number, MediaQueryList>()

/** Like useIsMobile for another breakpoint: true while the viewport is narrower than `width` px. */
export function useIsBelow(width: number): boolean {
  const subscribeTo = React.useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {}
      let query = queries.get(width)
      if (!query) {
        query = window.matchMedia(`(max-width: ${width - 1}px)`)
        queries.set(width, query)
      }
      query.addEventListener("change", callback)
      return () => query.removeEventListener("change", callback)
    },
    [width]
  )
  return React.useSyncExternalStore(
    subscribeTo,
    () => window.innerWidth < width,
    getServerSnapshot
  )
}
