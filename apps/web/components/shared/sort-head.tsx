"use client"

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableHead } from "@/components/ui/table"

/** A table header that sorts: ⇅ while idle, an arrow for the active column. */
export function SortHead<T extends string>({
  label,
  sort,
  active,
  order,
  onSort,
}: {
  label: string
  sort: T
  active: boolean
  order: "asc" | "desc"
  onSort: (sort: T) => void
}) {
  const Icon = order === "asc" ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 px-2"
        onClick={() => onSort(sort)}
      >
        {label}
        {active ? (
          <Icon data-icon="inline-end" />
        ) : (
          <ArrowUpDownIcon
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        )}
      </Button>
    </TableHead>
  )
}
