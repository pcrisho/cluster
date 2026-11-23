"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { SlashItem } from "@/lib/rich-text/slash-items"
import { tPlain } from "@/lib/i18n/plain"

export interface SlashMenuListRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

interface SlashMenuListProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

/**
 * List for the `/` menu. The editor keeps the focus, so the keys
 * reach `onKeyDown` through the suggestion plugin, not through cmdk.
 */
export const SlashMenuList = forwardRef<SlashMenuListRef, SlashMenuListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [selected, setSelected] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)
    // The query can shrink the list below the previous selection.
    const index = selected < items.length ? selected : 0
    const selectedTitle = items[index]?.title

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          // Enter is swallowed even with no items, so it does not split the paragraph.
          if (event.key === "Enter") {
            const item = items[index]
            if (item) command(item)
            return true
          }
          if (items.length === 0) return false
          if (event.key === "ArrowUp") {
            setSelected((index + items.length - 1) % items.length)
            return true
          }
          if (event.key === "ArrowDown") {
            setSelected((index + 1) % items.length)
            return true
          }
          return false
        },
      }),
      [items, index, command]
    )

    useEffect(() => {
      menuRef.current
        ?.querySelector('[data-selected="true"]')
        ?.scrollIntoView({ block: "nearest" })
    }, [selectedTitle])

    return (
      <Command
        ref={menuRef}
        shouldFilter={false}
        value={selectedTitle ?? ""}
        onValueChange={(value) =>
          setSelected(
            Math.max(
              0,
              items.findIndex((i) => i.title === value)
            )
          )
        }
        // Keep the editor focused while the user clicks an item.
        onMouseDown={(event) => event.preventDefault()}
        className="z-50 w-72 rounded-md! border border-muted shadow-md"
      >
        <CommandList className="max-h-[330px]">
          <CommandEmpty className="px-2 text-muted-foreground">
            {tPlain("editor.noResults")}
          </CommandEmpty>
          {items.map((item) => (
            <CommandItem
              key={item.title}
              value={item.title}
              onSelect={() => command(item)}
              className="gap-2 rounded-md px-2 py-1"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-muted bg-background">
                {item.icon}
              </div>
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    )
  }
)
