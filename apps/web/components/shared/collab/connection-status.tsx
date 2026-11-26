"use client"

import { cn } from "@/lib/utils"
import { describeStatus } from "@/lib/collab/status"
import type { CollabStatus } from "@/lib/collab/collab-session"
import { useTranslations } from "next-intl"

const TONE = {
  ok: "text-emerald-700 dark:text-emerald-400",
  muted: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-400",
}

/** Small live-editing indicator: a dot and the status text. */
export function ConnectionStatus({ status }: { status: CollabStatus }) {
  const t = useTranslations("collab.status")
  const { label, tone } = describeStatus(status)
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        TONE[tone]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(label)}
    </div>
  )
}
