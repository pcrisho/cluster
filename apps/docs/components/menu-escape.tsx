"use client"

import * as React from "react"

// Escape closes the open <details> (menu, "On this page") that holds the focus and returns it to its summary.
export function MenuEscape() {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const details = (document.activeElement as HTMLElement | null)?.closest("details")
      if (!details?.open) return
      details.open = false
      details.querySelector("summary")?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])
  return null
}
