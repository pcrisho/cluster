"use client"

import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslations } from "next-intl"

interface SortDropdownProps {
  sort: "top" | "recent"
  onSortChange: (sort: "top" | "recent") => void
}

const SORT_OPTIONS = ["top", "recent"] as const

export function SortDropdown({ sort, onSortChange }: SortDropdownProps) {
  const t = useTranslations("connect.feed")
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {t("sortBy")}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="font-semibold">
            {t(sort)}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => onSortChange(option)}
              className="justify-between"
            >
              {t(option)}
              {sort === option && <CheckIcon className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
