"use client"

import { useEffect, useRef } from "react"

/** Calls `expand` once `key` has stayed the same for `delay` ms; a null key does nothing. Used to open a closed branch while dragging over it. */
export function useHoverExpand(
  key: string | null,
  expand: (key: string) => void,
  delay = 600
) {
  const latest = useRef(expand)
  useEffect(() => {
    latest.current = expand
  })
  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => latest.current(key), delay)
    return () => clearTimeout(timer)
  }, [key, delay])
}
