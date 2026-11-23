"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FilterValueCombobox,
  FilterValueInput,
} from "@/components/connect/filter-value-combobox"
import {
  type DirectoryFilter,
  type SelectOption,
  getFieldConfig,
} from "@/lib/directory-filters"
import { useTranslations } from "next-intl"

interface FilterPillProps {
  filter: DirectoryFilter
  options?: SelectOption[]
  onChange: (updated: DirectoryFilter) => void
  onRemove: () => void
}

export function FilterPill({
  filter,
  options,
  onChange,
  onRemove,
}: FilterPillProps) {
  const t = useTranslations("connect.directory")
  const config = getFieldConfig(filter.field)

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 px-1 py-0.5">
      <span className="px-1.5 text-xs font-medium text-foreground">
        {t(`fields.${filter.field}`)}
      </span>

      <Select
        value={filter.operator}
        onValueChange={(op) =>
          onChange({ ...filter, operator: op as DirectoryFilter["operator"] })
        }
      >
        <SelectTrigger className="h-7 gap-1 border-0 bg-transparent px-1 text-xs shadow-none ring-0 focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {config.operators.map((op) => (
            <SelectItem key={op} value={op}>
              {t(`operators.${op}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {config.type === "select" && options ? (
        <FilterValueCombobox
          options={options}
          selected={filter.values}
          onChange={(vals) => onChange({ ...filter, values: vals })}
          placeholder={t("selectValue")}
        />
      ) : (
        <FilterValueInput
          value={filter.values[0] ?? ""}
          onChange={(v) => onChange({ ...filter, values: v ? [v] : [] })}
          placeholder={t("typeValue")}
        />
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="size-6 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-3.5" />
        <span className="sr-only">{t("removeFilter")}</span>
      </Button>
    </div>
  )
}
