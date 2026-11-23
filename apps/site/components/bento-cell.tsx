import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// A bento cell: what it proves on top, the piece of the product below, cropped by the cell.
export function BentoCell({
  children,
  className,
  description,
  title,
  flush = false,
  fade = false,
}: {
  children?: ReactNode
  className?: string
  description?: string
  title: string
  /** The content runs to the cell's right and bottom edges (a scaled screen). */
  flush?: boolean
  /** The content is taller than the cell: fade it out at the bottom. */
  fade?: boolean
}) {
  return (
    <div
      className={cn(
        "spotlight-cell flex min-h-56 flex-col overflow-hidden rounded-2xl glass-panel",
        className
      )}
    >
      <div className="p-6 pb-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          className={cn(
            "relative min-h-0 flex-1",
            flush ? "pl-6" : "px-6 pb-6",
            fade &&
              "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
