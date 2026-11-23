"use client"

import { useMemo, useState } from "react"
import { CornerDownLeftIcon, FileTextIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { PageTreeNode } from "@/lib/know-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface PageParentPickerProps {
  /** All pages in the same space, flat list. */
  pages: PageTreeNode[]
  /** The current parentId (or null for root). */
  value: string | null
  onChange: (id: string | null) => void
  /**
   * The current page's id. If provided, this page AND all its
   * descendants are filtered out of the picker to prevent cycles
   * (a page cannot be its own ancestor).
   */
  currentPageId?: string
  /** Custom trigger element. If omitted, a default button renders. */
  children?: React.ReactNode
  disabled?: boolean
}

function collectDescendantIds(
  pages: PageTreeNode[],
  rootId: string
): Set<string> {
  const descendants = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const p of pages) {
      if (p.parentId && descendants.has(p.parentId) && !descendants.has(p.id)) {
        descendants.add(p.id)
        added = true
      }
    }
  }
  return descendants
}

export function PageParentPicker({
  pages,
  value,
  onChange,
  currentPageId,
  children,
  disabled,
}: PageParentPickerProps) {
  const t = useTranslations("know.parentPicker")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)

  const excluded = useMemo(() => {
    if (!currentPageId) return new Set<string>()
    return collectDescendantIds(pages, currentPageId)
  }, [pages, currentPageId])

  const available = useMemo(
    () => pages.filter((p) => !excluded.has(p.id)),
    [pages, excluded]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return available
    const q = search.trim().toLowerCase()
    return available.filter((p) => p.title.toLowerCase().includes(q))
  }, [available, search])

  const currentLabel =
    value === null
      ? t("topLevel")
      : (pages.find((p) => p.id === value)?.title ?? t("unknown"))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="text-muted-foreground"
          >
            <CornerDownLeftIcon data-icon="inline-start" />
            {currentLabel}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <SearchIcon
              className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
                setSearch("")
              }}
              aria-selected={value === null}
              role="option"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                value === null
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
            >
              <CornerDownLeftIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{t("topLevelNoParent")}</span>
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("noMatch")}
            </li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.id)
                    setOpen(false)
                    setSearch("")
                  }}
                  aria-selected={p.id === value}
                  role="option"
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                    p.id === value
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
