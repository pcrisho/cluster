import type { ReactNode } from "react"
import { AlertTriangleIcon, InfoIcon, LightbulbIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type CalloutKind = "note" | "tip" | "warning"

const STYLES: Record<CalloutKind, string> = {
  note: "border-info-border bg-info-subtle text-foreground",
  tip: "border-success-border bg-success-subtle text-foreground",
  warning: "border-warning-border bg-warning-subtle text-foreground",
}

const ICON_STYLES: Record<CalloutKind, string> = {
  note: "text-info-text",
  tip: "text-success-text",
  warning: "text-warning-text",
}

const ICONS = {
  note: InfoIcon,
  tip: LightbulbIcon,
  warning: AlertTriangleIcon,
} as const

export function Callout({
  kind = "note",
  children,
}: {
  kind?: CalloutKind
  children: ReactNode
}) {
  const Icon = ICONS[kind]
  return (
    <div
      role="note"
      data-kind={kind}
      className={cn(
        "callout my-5 flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        STYLES[kind]
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_STYLES[kind])} aria-hidden />
      <div className="min-w-0 flex-1 [&>*:last-child]:mb-0">{children}</div>
    </div>
  )
}
