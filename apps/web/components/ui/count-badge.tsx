import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * A count on an icon's corner (the notification bell, the sidebar's course count).
 * Solid, so the digit stays legible over the icon's strokes. The position is the caller's.
 */
function CountBadge({
  className,
  ...props
}: React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant="destructive"
      className={cn(
        "pointer-events-none absolute h-4 min-w-4 bg-destructive px-1 text-3xs text-background tabular-nums dark:bg-destructive",
        className
      )}
      {...props}
    />
  )
}

export { CountBadge }
