"use client"

import { SearchIcon, Settings2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { DirectoryFiltersBar } from "@/components/connect/directory-filters-bar"
import type {
  DirectoryColumnId,
  DirectoryColumns,
} from "@/components/connect/directory-table"
import type { DirectoryFilter } from "@/lib/directory-filters"
import { OrgNode, Position } from "@/lib/org-api"

const COLUMN_IDS: DirectoryColumnId[] = ["position", "area"]

interface DirectoryToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  filters: DirectoryFilter[]
  onFiltersChange: (filters: DirectoryFilter[]) => void
  orgNodes: OrgNode[]
  positions: Position[]
  /** Only the table has columns to hide; omit it for the cards. */
  columns?: DirectoryColumns
  onColumnsChange?: (columns: DirectoryColumns) => void
}

export function DirectoryToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  orgNodes,
  positions,
  columns,
  onColumnsChange,
}: DirectoryToolbarProps) {
  const t = useTranslations("connect.directory")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <SearchIcon className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          aria-label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="min-w-0 flex-1">
        <DirectoryFiltersBar
          filters={filters}
          onFiltersChange={onFiltersChange}
          orgNodes={orgNodes}
          positions={positions}
        />
      </div>

      {columns && onColumnsChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="hidden lg:inline-flex">
              <Settings2Icon data-icon="inline-start" />
              {t("columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COLUMN_IDS.map((id) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={columns[id] !== false}
                onCheckedChange={(value) =>
                  onColumnsChange({ ...columns, [id]: !!value })
                }
              >
                {t(`fields.${id}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
