"use client"

import { PlusIcon } from "lucide-react"
import { useState, useMemo, useCallback } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FilterPill } from "@/components/connect/filter-pill"
import {
  type DirectoryFilter,
  type FilterField,
  type SelectOption,
  FILTER_FIELDS,
  getDefaultOperator,
  ROLES,
} from "@/lib/directory-filters"
import { OrgNode, Position } from "@/lib/org-api"
import { useTranslations } from "next-intl"

interface DirectoryFiltersBarProps {
  filters: DirectoryFilter[]
  onFiltersChange: (filters: DirectoryFilter[]) => void
  orgNodes: OrgNode[]
  positions: Position[]
}

export function DirectoryFiltersBar({
  filters,
  onFiltersChange,
  orgNodes,
  positions,
}: DirectoryFiltersBarProps) {
  const tr = useTranslations("common.roles")
  const t = useTranslations("connect.directory")
  const [popoverOpen, setPopoverOpen] = useState(false)

  const usedFields = new Set(filters.map((f) => f.field))

  const availableFields = FILTER_FIELDS.filter((f) => !usedFields.has(f.field))

  const areaOptions: SelectOption[] = useMemo(
    () => orgNodes.map((n) => ({ value: n.id, label: n.name })),
    [orgNodes]
  )

  const positionOptions: SelectOption[] = useMemo(
    () =>
      positions
        .filter((p) => p.isActive)
        .map((p) => ({
          value: p.id,
          label: p.name,
        })),
    [positions]
  )

  const roleOptions: SelectOption[] = ROLES.map((role) => ({
    value: role,
    label: tr(role),
  }))

  function getOptions(field: FilterField): SelectOption[] {
    switch (field) {
      case "area":
        return areaOptions
      case "position":
        return positionOptions
      case "role":
        return roleOptions
      default:
        return []
    }
  }

  const addFilter = useCallback(
    (field: FilterField) => {
      const config = FILTER_FIELDS.find((f) => f.field === field)!
      const newFilter: DirectoryFilter = {
        id: field,
        field,
        operator: getDefaultOperator(config.type),
        values: [],
      }
      onFiltersChange([...filters, newFilter])
      setPopoverOpen(false)
    },
    [filters, onFiltersChange]
  )

  const updateFilter = useCallback(
    (id: string, updated: DirectoryFilter) => {
      onFiltersChange(filters.map((f) => (f.id === id ? updated : f)))
    },
    [filters, onFiltersChange]
  )

  const removeFilter = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id))
    },
    [filters, onFiltersChange]
  )

  const clearAll = useCallback(() => {
    onFiltersChange([])
  }, [onFiltersChange])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={availableFields.length === 0}>
            <PlusIcon data-icon="inline-start" />
            {t("addFilter")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {availableFields.map((f) => (
                  <CommandItem
                    key={f.field}
                    value={f.field}
                    onSelect={() => addFilter(f.field)}
                  >
                    {t(`fields.${f.field}`)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {filters.map((f) => (
        <FilterPill
          key={f.id}
          filter={f}
          options={getOptions(f.field)}
          onChange={(updated) => updateFilter(f.id, updated)}
          onRemove={() => removeFilter(f.id)}
        />
      ))}

      {filters.length >= 2 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="text-xs text-muted-foreground"
        >
          {t("clearAll")}
        </Button>
      )}
    </div>
  )
}
