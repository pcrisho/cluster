"use client"

import * as React from "react"
import { motion, type HTMLMotionProps, type Variants } from "motion/react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type ModuleColorToken = "primary" | "sky" | "emerald" | "amber"
export type ModulePattern = "none"
export type ModuleVariant = "wizard" | "bento" | "modules"

interface ColorSpec {
  /** Solid color used for dots/bars/striae. */
  dot: string
  /** Card ring color (low opacity). */
  ring: string
  /** Inner card gradient "from" stop (low opacity). */
  cardFrom: string
  /** Inner card gradient "to" stop (transparent). */
  cardTo: string
  /** Icon stroke/text color. */
  iconText: string
  /** Shadow color for subtle glow. */
  shadow: string
  /** Background icon color (low opacity for the large centered icon). */
  bgIcon: string
}

/**
 * Per-module color palette. Each entry is a flat string literal so
 * Tailwind v4 JIT can pick up the classes at build time. If you add a
 * new token here, also add its name to the {@link ModuleColorToken} type.
 */
const COLORS: Record<ModuleColorToken, ColorSpec> = {
  primary: {
    dot: "bg-primary",
    ring: "ring-primary/30",
    cardFrom: "from-primary/15",
    cardTo: "to-primary/5",
    iconText: "text-primary",
    shadow: "shadow-primary/20",
    bgIcon: "text-primary/12",
  },
  sky: {
    dot: "bg-sky-500",
    ring: "ring-sky-500/30",
    cardFrom: "from-sky-500/15",
    cardTo: "to-sky-500/5",
    iconText: "text-sky-500",
    shadow: "shadow-sky-500/20",
    bgIcon: "text-sky-500/12",
  },
  emerald: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    cardFrom: "from-emerald-500/15",
    cardTo: "to-emerald-500/5",
    iconText: "text-emerald-500",
    shadow: "shadow-emerald-500/20",
    bgIcon: "text-emerald-500/12",
  },
  amber: {
    dot: "bg-amber-500",
    ring: "ring-amber-500/30",
    cardFrom: "from-amber-500/15",
    cardTo: "to-amber-500/5",
    iconText: "text-amber-500",
    shadow: "shadow-amber-500/20",
    bgIcon: "text-amber-500/12",
  },
}

interface VariantSpec {
  card: string
  bgIconSize: string
  title: string
  description: string
}

const VARIANTS: Record<ModuleVariant, VariantSpec> = {
  wizard: {
    card: "gap-3 p-4",
    bgIconSize: "size-16",
    title: "text-base",
    description: "text-sm",
  },
  bento: {
    card: "gap-3 p-6",
    bgIconSize: "size-20",
    title: "text-lg",
    description: "text-base",
  },
  modules: {
    card: "gap-4 p-6",
    bgIconSize: "size-24",
    title: "text-xl",
    description: "text-base",
  },
}

export interface ModuleCardProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  /** Module display name, e.g. "CONNECT". */
  name: string
  /** One-line description of the module. */
  description: string
  /** Lucide icon for the module. */
  icon: LucideIcon
  /** Color token mapping the module to its palette entry. */
  colorToken: ModuleColorToken
  /** Visual scale/typography variant. Defaults to "wizard". */
  variant?: ModuleVariant
  /**
   * Optional motion variants for staggered entrance. Pass this when the
   * parent uses `motion.div` with `initial`/`animate` + `staggerChildren`.
   * Without it, the card renders statically.
   */
  motionVariants?: Variants
}

/* ─── No more micro-patterns — icon becomes the background element ──── */

/**
 * Shared module card — used by the onboarding wizard's "explore" step
 * and the landing bento section. Visual treatment:
 *
 * - Large centered icon as background (low opacity ~12%)
 * - Text overlay on top with better contrast
 * - 2px top accent bar in the module's color
 * - Subtle diagonal inner gradient
 * - 2px ring in the module's color with colored shadow
 *
 * `variant` controls padding/typography only. The card is informational
 * (no link). Wrap in `motion.div` in the parent for staggered entrance.
 */
export const ModuleCard = React.forwardRef<HTMLDivElement, ModuleCardProps>(
  function ModuleCard(
    {
      name,
      description,
      icon: Icon,
      colorToken,
      variant = "wizard",
      motionVariants,
      className,
      ...rest
    },
    ref
  ) {
    const color = COLORS[colorToken]
    const v = VARIANTS[variant]

    const cardContent = (
      <>
        {/* Large centered background icon with low opacity */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center",
            v.bgIconSize,
            color.bgIcon,
            "mx-auto"
          )}
        >
          <Icon className={cn(v.bgIconSize)} strokeWidth={1.5} />
        </span>

        {/* Text block on top of the background icon */}
        <div className="relative flex min-w-0 flex-col gap-1">
          <p className={cn("font-bold text-foreground tracking-tight", v.title)}>
            {name}
          </p>
          <p
            className={cn(
              "text-muted-foreground",
              v.description,
              variant === "wizard" ? "leading-snug" : "leading-relaxed"
            )}
          >
            {description}
          </p>
        </div>
      </>
    )

    return (
      <motion.div
        ref={ref}
        variants={motionVariants}
        className={cn(
          // Card surface
          "relative isolate flex flex-col items-start overflow-hidden rounded-xl",
          "border bg-card text-left ring-2",
          color.ring,
          color.shadow,
          "shadow-lg",
          // Inner diagonal gradient
          "bg-gradient-to-br",
          color.cardFrom,
          color.cardTo,
          // Variant sizing
          v.card,
          className
        )}
        {...rest}
      >
        {cardContent}
      </motion.div>
    )
  }
)
