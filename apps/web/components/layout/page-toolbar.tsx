import * as React from "react"

import { cn } from "@/lib/utils"

interface PageToolbarProps {
  left?: React.ReactNode
  primaryAction: React.ReactNode
  secondaryActions?: React.ReactNode
  className?: string
}

export function PageToolbar({
  left,
  primaryAction,
  secondaryActions,
  className,
}: PageToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {left}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondaryActions}
        {primaryAction}
      </div>
    </div>
  )
}
