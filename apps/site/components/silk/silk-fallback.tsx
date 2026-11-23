import * as React from "react"

/**
 * Static token-only fallback for environments without WebGL
 * or when prefers-reduced-motion is active.
 * Uses radial gradient of primary/10 over background.
 */
export function SilkFallback() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-background bg-radial from-primary/10 via-background/60 to-background"
    />
  )
}
