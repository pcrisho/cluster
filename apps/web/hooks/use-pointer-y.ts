"use client"

import { useEffect, useRef } from "react"

/**
 * The pointer's real height in the viewport while `active`. dnd-kit's own `delta` also counts how far
 * the page scrolled, so `start + delta` is wrong as soon as auto-scroll kicks in.
 */
export function usePointerY(active: boolean) {
  const y = useRef<number | null>(null)
  useEffect(() => {
    if (!active) return
    const track = (e: PointerEvent) => {
      y.current = e.clientY
    }
    window.addEventListener("pointermove", track, { passive: true })
    return () => {
      window.removeEventListener("pointermove", track)
      y.current = null
    }
  }, [active])
  return y
}
