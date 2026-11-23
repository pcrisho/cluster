"use client"

import type { PointerEvent, ReactNode } from "react"

// One listener for the grid: the cell under the pointer gets --x/--y for its `.spotlight-cell` glow.
export function SpotlightGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return
    const cell = (event.target as Element).closest<HTMLElement>(
      ".spotlight-cell"
    )
    if (!cell) return
    const rect = cell.getBoundingClientRect()
    cell.style.setProperty("--x", `${event.clientX - rect.left}px`)
    cell.style.setProperty("--y", `${event.clientY - rect.top}px`)
  }

  return (
    <div className={className} onPointerMove={onPointerMove}>
      {children}
    </div>
  )
}
