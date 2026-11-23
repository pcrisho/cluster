"use client"

import { forwardRef, useEffect, useImperativeHandle, useState } from "react"
import { CornerDownLeft, FileText } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { PageMentionSearchResult } from "@/lib/documents/types"
import { tPlain } from "@/lib/i18n/plain"

export interface MentionListRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

interface MentionListProps {
  items: PageMentionSearchResult[]
  command: (item: PageMentionSearchResult) => void
}

/**
 * Popup used by the `<PageMention />` extension when the user
 * types `@`. Handles keyboard nav (↑ ↓ Enter Esc) and click
 * selection. Stays mounted in the DOM only while the
 * suggestion popup is open (managed by `createSuggestionPopup`).
 */
export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Clamp the selected index when the items list changes
    // (e.g. after the async search resolves). If the previous
    // selection is out of range, reset to 0. We schedule the
    // update with queueMicrotask to avoid the
    // react-hooks/set-state-in-effect lint.
    useEffect(() => {
      queueMicrotask(() => setSelectedIndex((i) => (i >= items.length ? 0 : i)))
    }, [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) {
          if (event.key === "Enter") return true
          return false
        }
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selectedIndex]
          if (item) command(item)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="z-50 w-80 rounded-md border border-muted bg-background px-3 py-2 text-sm shadow-md">
          <span className="text-muted-foreground">
            {tPlain("editor.noPages")}
          </span>
        </div>
      )
    }

    return (
      <div className="z-50 max-h-80 w-80 overflow-y-auto rounded-md border border-muted bg-background shadow-md">
        <ul className="flex flex-col p-1">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  i === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.spaceName}
                    {item.archived ? ` · ${tPlain("editor.archived")}` : ""}
                  </p>
                </div>
                {i === selectedIndex ? (
                  <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
)

export function MentionListSkeleton() {
  return (
    <div className="z-50 w-80 rounded-md border border-muted bg-background p-2 shadow-md">
      <Skeleton className="mb-1 h-6" />
      <Skeleton className="mb-1 h-6" />
      <Skeleton className="h-6" />
    </div>
  )
}
