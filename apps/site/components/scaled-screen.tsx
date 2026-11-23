import type { CSSProperties, ReactNode } from "react"

// A whole app screen at its native width, zoomed to fit its box (CSS in globals.css, no JS).
export function ScaledScreen({
  children,
  width = 1280,
}: {
  children: ReactNode
  width?: number
}) {
  return (
    <div
      className="scaled-screen"
      style={{ "--screen-width": `${width}px` } as CSSProperties}
    >
      <div className="scaled-screen-inner">{children}</div>
    </div>
  )
}
