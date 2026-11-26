"use client"

import { CheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type FilterOption = { value: string; label: string; hint?: string }

/** A multi-select combobox: each pick toggles one value; the caller stores the list. */
export function ReportMultiFilter({
  label,
  options,
  selected,
  onChange,
  trigger,
  open,
  onOpenChange,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
  trigger: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("grow.reportFilters")
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput aria-label={label} placeholder={t("searchValues")} />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const on = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() =>
                      onChange(
                        on
                          ? selected.filter((value) => value !== option.value)
                          : [...selected, option.value]
                      )
                    }
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                    >
                      {on && <CheckIcon className="size-3" />}
                    </span>
                    <span className="truncate">{option.label}</span>
                    {option.hint && (
                      <span className="ml-auto text-muted-foreground tabular-nums">
                        {option.hint}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
