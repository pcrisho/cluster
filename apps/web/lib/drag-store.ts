import { useSyncExternalStore } from "react"

/**
 * A tiny store for drag state that changes on every move. Rows read only their own slice
 * through `useDragSelector`, so moving the pointer re-renders the rows that changed, not all of them.
 */
export function createDragStore<S>(initial: S) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next: S) {
      if (Object.is(next, state)) return
      state = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type DragStore<S> = ReturnType<typeof createDragStore<S>>

/** `selector` must return the same reference while its slice is unchanged. */
export function useDragSelector<S, R>(
  store: DragStore<S>,
  selector: (state: S) => R
): R {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get())
  )
}
