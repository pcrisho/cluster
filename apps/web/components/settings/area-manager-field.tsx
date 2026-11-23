"use client"

import { useState } from "react"
import { ChevronsUpDownIcon, UserIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PrincipalPicker } from "@/components/shared/principal-picker"

export interface AreaManager {
  id: string
  name: string
}

/** Who runs an area: one person, or nobody. A person can run only one area (the API says so). */
export function AreaManagerField({
  value,
  onChange,
  disabled,
}: {
  value: AreaManager | null
  onChange: (manager: AreaManager | null) => void
  disabled?: boolean
}) {
  const t = useTranslations("settings.areas")
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserIcon className="text-muted-foreground" />
              <span
                className={
                  value ? "truncate" : "truncate text-muted-foreground"
                }
              >
                {value?.name ?? t("managerPlaceholder")}
              </span>
            </span>
            <ChevronsUpDownIcon
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <PrincipalPicker
            types={["USER"]}
            placeholder={t("managerSearch")}
            taken={new Set(value ? [`USER:${value.id}`] : [])}
            takenLabel={t("currentManager")}
            onPick={(person) => {
              onChange({ id: person.id, name: person.name })
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={t("removeManager")}
          onClick={() => onChange(null)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
