import type { DragMoveEvent, KeyboardCoordinateGetter } from "@dnd-kit/core"

/** Where on a row a drop lands: the top third goes before it, the bottom third after it, the middle inside it. */
export type DropZone = "before" | "inside" | "after"

export function zoneOf(
  y: number,
  rect: { top: number; height: number }
): DropZone {
  const ratio = (y - rect.top) / rect.height
  if (ratio < 0.3) return "before"
  if (ratio > 0.7) return "after"
  return "inside"
}

/** A row's place in the scrolling list: `top` from the top of the content, so it holds while the list scrolls. */
export interface RowBox {
  id: string
  top: number
  height: number
}

/** The row at `y` (same origin as `top`), by bisection; `rows` run top to bottom. */
export function rowAt(rows: readonly RowBox[], y: number): RowBox | null {
  let lo = 0
  let hi = rows.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const row = rows[mid]
    if (y < row.top) hi = mid - 1
    else if (y >= row.top + row.height) lo = mid + 1
    else return row
  }
  return null
}

/** Arrow keys move the held row a third of a row at a time, so each press lands on the next zone. */
const KEY_STEP = 12

export const treeKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates }
) => {
  if (event.code === "ArrowDown")
    return { ...currentCoordinates, y: currentCoordinates.y + KEY_STEP }
  if (event.code === "ArrowUp")
    return { ...currentCoordinates, y: currentCoordinates.y - KEY_STEP }
  return undefined
}

/**
 * Where the pointer is on screen during a drag. `tracked` is the live pointer (`usePointerY`); the
 * keyboard has no pointer, so the middle of the held row stands in for it.
 */
export function dragY(
  event: DragMoveEvent,
  tracked: number | null
): number | null {
  if ("clientY" in event.activatorEvent)
    return tracked ?? (event.activatorEvent as PointerEvent).clientY
  const held = event.active.rect.current.translated
  return held ? held.top + held.height / 2 : null
}
