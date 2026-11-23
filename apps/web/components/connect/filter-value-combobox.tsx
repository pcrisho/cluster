"use client"

import { CheckIcon, SearchIcon } from "lucide-react"
import { useState, useMemo } from "react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SelectOption } from "@/lib/directory-filters"
import { useTranslations } from "next-intl"

interface FilterValueComboboxProps {
  options: SelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function FilterValueCombobox({
  options,
  selected,
  onChange,
  placeholder,
  disabled = false,
}: FilterValueComboboxProps) {
  const t = useTranslations("connect.directory")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search) return options
    const s = search.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)
    )
  }, [options, search])

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-auto min-w-[80px] gap-1 px-2 py-1",
            selected.length > 0 && "text-foreground"
          )}
        >
          {selected.length > 0 ? (
            <span className="flex items-center gap-1">
              {selected.map((id) => {
                const opt = options.find((o) => o.value === id)
                return opt ? (
                  <Badge key={id} variant="secondary" className="font-normal">
                    {opt.label}
                  </Badge>
                ) : null
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => {
                const isSelected = selected.includes(opt.value)
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => toggle(opt.value)}
                  >
                    <CheckIcon
                      className={cn(
                        "size-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt.label}
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

interface FilterValueInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function FilterValueInput({
  value,
  onChange,
  placeholder,
}: FilterValueInputProps) {
  return (
    <div className="relative">
      <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        className="h-7 w-[160px] rounded-md border border-input bg-transparent pr-2 pl-7 text-xs outline-none focus:border-ring"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
