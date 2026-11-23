import { createElement } from "react"

import { getSpaceIcon } from "@/lib/space-icons"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: { icon: "size-4", emoji: "text-sm" },
  md: { icon: "size-5", emoji: "text-lg" },
  lg: { icon: "size-8", emoji: "text-3xl" },
  xl: { icon: "size-12", emoji: "text-5xl" },
} as const

interface EntityGlyphProps {
  iconType: "LUCIDE" | "EMOJI"
  icon: string | null
  emoji: string | null
  /** Lucide icon used when `icon` is empty. */
  fallback?: string
  size?: keyof typeof SIZES
  className?: string
}

/** The icon of a space, page or course: an emoji or one of the lucide presets. */
export function EntityGlyph({
  iconType,
  icon,
  emoji,
  fallback = "file-text",
  size = "sm",
  className,
}: EntityGlyphProps) {
  if (iconType === "EMOJI" && emoji) {
    return (
      <span aria-hidden className={cn("leading-none", SIZES[size].emoji, className)}>
        {emoji}
      </span>
    )
  }
  // The icon is picked from a fixed set by name, so the lint rule against dynamic components does not apply.
  return createElement(getSpaceIcon(icon || fallback), {
    "aria-hidden": true,
    className: cn(SIZES[size].icon, className),
  })
}
