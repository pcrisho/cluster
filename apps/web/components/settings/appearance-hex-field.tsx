"use client"

import { useTranslations } from "next-intl"
import { PaletteIcon } from "lucide-react"
import { normalizeHex } from "@cluster/theme"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ColorCanvas } from "@/components/shared/color-canvas"

/** A hex input with the HSV canvas from `lib/color.ts` beside it. */
export function HexField({
  id,
  label,
  description,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string
  label: string
  description: string
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  error: string | null
}) {
  const t = useTranslations("settings.appearance")
  const hex = value ? normalizeHex(value) : null
  return (
    <Field
      data-invalid={!!error || undefined}
      data-disabled={disabled || undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={t("hexPlaceholder")}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          spellCheck={false}
          autoComplete="off"
          className="font-mono sm:w-40"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={t("pick", { label })}
            >
              {hex ? (
                <span
                  aria-hidden
                  className="size-4 rounded-sm border"
                  style={{ backgroundColor: hex }}
                />
              ) : (
                <PaletteIcon aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <ColorCanvas value={hex} onChange={onChange} />
          </PopoverContent>
        </Popover>
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  )
}
