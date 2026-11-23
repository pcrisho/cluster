import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { Slot } from "radix-ui"

import type { Tone } from "@/lib/tone"
import { cn } from "@/lib/utils"

// Full class names so Tailwind generates them.
const BADGE: Record<Tone, string> = {
  success: "border-success-border bg-success-subtle text-success-text",
  warning: "border-warning-border bg-warning-subtle text-warning-text",
  info: "border-info-border bg-info-subtle text-info-text",
  danger: "border-danger-border bg-danger-subtle text-danger-text",
  neutral: "border-neutral-border bg-neutral-subtle text-neutral-text",
}

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  neutral: "bg-neutral",
}

/**
 * A status as tone plus icon or word, never colour alone (`docs/design-system.md`).
 * `badge` for chips; `dot` for list rows, where the label stays in the text colour.
 */
function StatusBadge({
  tone,
  icon: Icon,
  variant = "badge",
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone: Tone
  icon?: LucideIcon
  variant?: "badge" | "dot"
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "span"
  const content = asChild ? (
    <Slot.Slottable>{children}</Slot.Slottable>
  ) : (
    children
  )
  if (variant === "dot")
    return (
      <Comp
        data-slot="status-badge"
        data-tone={tone}
        className={cn(
          "inline-flex w-fit shrink-0 items-center gap-1.5 text-xs whitespace-nowrap",
          className
        )}
        {...props}
      >
        <span aria-hidden className={cn("size-1.5 rounded-full", DOT[tone])} />
        {content}
      </Comp>
    )
  return (
    <Comp
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-2xs font-medium whitespace-nowrap has-[>svg]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0 [a&]:transition-colors [a&]:hover:brightness-95 dark:[a&]:hover:brightness-110",
        BADGE[tone],
        className
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden />}
      {content}
    </Comp>
  )
}

export { StatusBadge }
