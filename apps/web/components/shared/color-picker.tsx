"use client"

import * as React from "react"
import { CheckIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ColorCanvas } from "@/components/shared/color-canvas"
import { isValidHex, normalizeHex } from "@/lib/color"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const DEFAULT_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
  "#0f172a", // slate-dark
]

interface ColorPickerProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  palette?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Initial tab. Default: "palette". */
  defaultTab?: "palette" | "canvas"
}

export function ColorPicker({
  value,
  onChange,
  palette = DEFAULT_PALETTE,
  placeholder,
  disabled = false,
  className,
  defaultTab = "palette",
}: ColorPickerProps) {
  const t = useTranslations("shared.colorPicker")
  const [open, setOpen] = React.useState(false)
  const [hexInput, setHexInput] = React.useState(value ?? "")

  // Keep local hex input in sync when external value changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setHexInput(value ?? "")
    })
  }, [value])

  function handleSelect(color: string) {
    onChange(color)
    setOpen(false)
  }

  function handleClear() {
    onChange(null)
    setHexInput("")
    setOpen(false)
  }

  function handleHexApply() {
    const trimmed = hexInput.trim()
    if (trimmed === "") {
      onChange(null)
      return
    }
    const normalized = normalizeHex(trimmed)
    if (normalized) {
      onChange(normalized)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value ? (
            <>
              <span
                className="size-4 shrink-0 rounded-sm border"
                style={{ backgroundColor: value }}
                aria-hidden
              />
              <span className="font-mono text-xs uppercase">{value}</span>
            </>
          ) : (
            <>
              <span
                className="size-4 shrink-0 rounded-sm border border-dashed border-muted-foreground/40"
                aria-hidden
              />
              <span>{placeholder ?? t("none")}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[260px] p-3">
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="palette">{t("palette")}</TabsTrigger>
            <TabsTrigger value="canvas">{t("canvas")}</TabsTrigger>
          </TabsList>

          <TabsContent value="palette" className="mt-0">
            <div className="grid grid-cols-7 gap-1.5">
              {palette.map((color) => {
                const selected = value === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleSelect(color)}
                    className={cn(
                      "size-7 rounded-md border-2 transition-all hover:scale-110",
                      selected
                        ? "border-foreground ring-2 ring-foreground/20"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={t("color", { color })}
                  >
                    {selected && (
                      <CheckIcon className="size-full p-1 text-white drop-shadow" />
                    )}
                  </button>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="canvas" className="mt-0">
            <ColorCanvas value={value} onChange={onChange} />
          </TabsContent>

          {/* Hex input (compartido) */}
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="custom-hex" className="text-xs">
                {t("customHex")}
              </Label>
              <Input
                id="custom-hex"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleHexApply()
                  }
                }}
                placeholder={t("hexPlaceholder")}
                className="h-8 font-mono text-xs"
              />
            </div>
            <Button
              size="sm"
              type="button"
              onClick={handleHexApply}
              disabled={hexInput.trim() !== "" && !isValidHex(hexInput)}
              className="h-8"
            >
              <PlusIcon />
              {t("apply")}
            </Button>
          </div>

          {value && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleClear}
              className="self-start text-muted-foreground"
            >
              {t("clear")}
            </Button>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
