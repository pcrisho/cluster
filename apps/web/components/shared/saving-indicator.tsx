"use client"

import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SavingState } from "@/lib/use-entity-autosave"
import { useTranslations } from "next-intl"

interface SavingIndicatorProps {
  state: SavingState
  onRetry?: () => void
  className?: string
}

/**
 * Visual indicator for the autosave state machine.
 *
 * - idle: renders nothing
 * - saving: spinner + "Saving…"
 * - saved: check + "Saved" (auto-clears to idle after 3s on the hook)
 * - failed: alert + "Failed to save" + optional Retry button
 */
export function SavingIndicator({
  state,
  onRetry,
  className,
}: SavingIndicatorProps) {
  const t = useTranslations("shared.saving")
  if (state === "idle") return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        state === "saving" && "text-muted-foreground",
        state === "saved" &&
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
        state === "failed" && "bg-destructive/10 text-destructive",
        className
      )}
    >
      {state === "saving" && (
        <Loader2Icon className="size-3 animate-spin" aria-hidden />
      )}
      {state === "saved" && <CheckIcon className="size-3" aria-hidden />}
      {state === "failed" && <AlertCircleIcon className="size-3" aria-hidden />}
      <span>{t(state)}</span>
      {state === "failed" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 underline underline-offset-2 hover:no-underline"
        >
          {t("retry")}
        </button>
      )}
    </div>
  )
}
