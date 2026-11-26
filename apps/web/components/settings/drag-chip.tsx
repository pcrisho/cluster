import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** What follows the pointer while dragging a row: what is held and, under it, what dropping would do. */
export function DragChip({
  icon,
  title,
  hint,
  invalid = false,
}: {
  icon: ReactNode
  title: string
  hint?: string
  invalid?: boolean
}) {
  return (
    <div
      className={cn(
        "flex w-max max-w-sm animate-in cursor-grabbing items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md duration-150 fade-in-0 zoom-in-95 motion-reduce:animate-none",
        invalid && "cursor-not-allowed border-danger-border"
      )}
    >
      {icon}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {hint && (
          <p
            className={cn(
              "truncate text-xs",
              invalid ? "text-danger-text" : "text-muted-foreground"
            )}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
