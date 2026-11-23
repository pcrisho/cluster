"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { hsvToHex, hexToHsv, type HSV } from "@/lib/color"
import { useTranslations } from "next-intl"

interface ColorCanvasProps {
  /** Current color in hex. Controlled. */
  value: string | null | undefined
  onChange: (hex: string) => void
  className?: string
}

/**
 * Interactive HSV color canvas.
 * - Top: hue slider (full rainbow).
 * - Main: saturation/value gradient with a circular picker.
 * - Click/drag on either sets the value.
 */
export function ColorCanvas({ value, onChange, className }: ColorCanvasProps) {
  const t = useTranslations("shared.colorCanvas")
  // Derive HSV from value; default to a sane fallback if invalid
  const initial = React.useMemo<HSV>(() => {
    if (value) {
      const parsed = hexToHsv(value)
      if (parsed) return parsed
    }
    return { h: 250, s: 70, v: 60 }
  }, [value])

  const [hsv, setHsv] = React.useState<HSV>(initial)

  // Keep local HSV in sync when external value changes meaningfully
  React.useEffect(() => {
    if (value) {
      const parsed = hexToHsv(value)
      if (parsed) {
        const dr = Math.abs(parsed.h - hsv.h)
        const ds = Math.abs(parsed.s - hsv.s)
        const dv = Math.abs(parsed.v - hsv.v)
        if (dr > 1 || ds > 1 || dv > 1) {
          queueMicrotask(() => setHsv(parsed))
        }
      }
    }
  }, [value, hsv.h, hsv.s, hsv.v])

  const svAreaRef = React.useRef<HTMLDivElement>(null)
  const [draggingSv, setDraggingSv] = React.useState(false)
  const [draggingHue, setDraggingHue] = React.useState(false)
  const hueRef = React.useRef<HTMLDivElement>(null)

  const hueColor = hsvToHex({ h: hsv.h, s: 100, v: 100 })

  function commit(h: number, s: number, v: number) {
    setHsv({ h, s, v })
    onChange(hsvToHex({ h, s, v }))
  }

  function pickSv(clientX: number, clientY: number) {
    const el = svAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const s = x * 100
    const v = (1 - y) * 100
    commit(hsv.h, s, v)
  }

  function pickHue(clientX: number) {
    const el = hueRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    commit(x * 360, hsv.s, hsv.v)
  }

  // ───── SV area events ─────
  function handleSvPointerDown(e: React.PointerEvent) {
    setDraggingSv(true)
    pickSv(e.clientX, e.clientY)
  }
  function handleSvPointerMove(e: React.PointerEvent) {
    if (!draggingSv) return
    pickSv(e.clientX, e.clientY)
  }
  function handleSvPointerUp() {
    setDraggingSv(false)
  }

  // ───── Hue events ─────
  function handleHuePointerDown(e: React.PointerEvent) {
    setDraggingHue(true)
    pickHue(e.clientX)
  }
  function handleHuePointerMove(e: React.PointerEvent) {
    if (!draggingHue) return
    pickHue(e.clientX)
  }
  function handleHuePointerUp() {
    setDraggingHue(false)
  }

  // Global pointer up to end drag even if mouse leaves the area
  React.useEffect(() => {
    if (!draggingSv && !draggingHue) return
    function onUp() {
      setDraggingSv(false)
      setDraggingHue(false)
    }
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [draggingSv, draggingHue])

  const svX = hsv.s
  const svY = 100 - hsv.v
  const hueX = (hsv.h / 360) * 100

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* SV area */}
      <div
        ref={svAreaRef}
        role="slider"
        aria-label={t("area")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={t("areaValue", {
          s: Math.round(hsv.s),
          v: Math.round(hsv.v),
        })}
        tabIndex={0}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        onPointerUp={handleSvPointerUp}
        className="relative h-40 w-full cursor-crosshair touch-none rounded-md border select-none"
        style={{
          background: `linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, ${hueColor} 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
          style={{
            left: `${svX}%`,
            top: `${svY}%`,
            backgroundColor: value ?? hueColor,
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        role="slider"
        aria-label={t("hue")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onPointerDown={handleHuePointerDown}
        onPointerMove={handleHuePointerMove}
        onPointerUp={handleHuePointerUp}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full select-none"
        style={{
          background:
            "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
          style={{
            left: `${hueX}%`,
            backgroundColor: hueColor,
          }}
        />
      </div>
    </div>
  )
}
