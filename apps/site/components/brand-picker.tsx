"use client"

import { useEffect, useState } from "react"
import { EMPTY_SEEDS, PRESETS, themeCss } from "@cluster/theme"

// Re-themes the whole page the way an instance does: the same `themeCss` the product renders.
export function BrandPicker({ label }: { label: string }) {
  const [hex, setHex] = useState(PRESETS[0]!.hex)
  const css =
    hex === PRESETS[0]!.hex
      ? ""
      : themeCss({ ...EMPTY_SEEDS, brandPrimary: hex })

  // Silk reads --primary from the page: tell it after the new <style> is in.
  useEffect(() => {
    window.dispatchEvent(new Event("cluster:brand-change"))
  }, [hex])

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-3">
      {css && <style>{css}</style>}
      {PRESETS.map((preset) => (
        <button
          type="button"
          aria-pressed={preset.hex === hex}
          aria-label={preset.name}
          key={preset.name}
          onClick={() => setHex(preset.hex)}
          className="size-9 rounded-full border border-border outline-offset-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-card"
          style={{ backgroundColor: preset.hex }}
        />
      ))}
    </div>
  )
}
