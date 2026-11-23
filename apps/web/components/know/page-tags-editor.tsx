"use client"

import { useMemo, useState } from "react"
import { PlusIcon, TagIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { knowApi, type Tag } from "@/lib/know-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface PageTagsEditorProps {
  /** All available tags in the org. */
  availableTags: Tag[]
  /** IDs of tags currently assigned to the page. */
  value: string[]
  /** Called with the new full list of tag ids when toggled/created. */
  onChange: (tagIds: string[]) => void
  /** Custom trigger element. */
  children?: React.ReactNode
  disabled?: boolean
}

export function PageTagsEditor({
  availableTags,
  value,
  onChange,
  children,
  disabled,
}: PageTagsEditorProps) {
  const tg = useTranslations("know.tags")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [draftTag, setDraftTag] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const selectedSet = useMemo(() => new Set(value), [value])

  const byId = useMemo(
    () => new Map(availableTags.map((t) => [t.id, t])),
    [availableTags]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return availableTags
    const q = search.trim().toLowerCase()
    return availableTags.filter((t) => t.name.toLowerCase().includes(q))
  }, [availableTags, search])

  const handleToggle = (tagId: string) => {
    if (selectedSet.has(tagId)) {
      onChange(value.filter((id) => id !== tagId))
    } else {
      onChange([...value, tagId])
    }
  }

  const handleCreate = async () => {
    const name = draftTag.trim()
    if (!name) return
    setIsCreating(true)
    try {
      const result = await knowApi.createTag(name)
      if (result.success && result.data) {
        const newTag = result.data
        onChange([...value, newTag.id])
        setDraftTag("")
        toast.success(tg("created", { name }))
      }
    } catch {
      toast.error(tg("createFailed"))
    } finally {
      setIsCreating(false)
    }
  }

  const selectedTags = value
    .map((id) => byId.get(id))
    .filter((t): t is Tag => Boolean(t))

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
            <TagIcon data-icon="inline-start" />
            {tg("button", { count: value.length })}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tg("search")}
            className="h-8 text-sm"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-1 p-2">
          {filtered.length === 0 ? (
            <p className="w-full text-center text-xs text-muted-foreground">
              {tg("noMatch")}
            </p>
          ) : (
            filtered.map((t) => {
              const isSelected = selectedSet.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleToggle(t.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  #{t.name}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t p-2">
          <Input
            value={draftTag}
            onChange={(e) => setDraftTag(e.target.value)}
            placeholder={tg("newName")}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleCreate()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!draftTag.trim() || isCreating}
            onClick={() => void handleCreate()}
          >
            <PlusIcon data-icon="inline-start" />
            {tg("create")}
          </Button>
        </div>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-t p-2">
            <span className="w-full text-[11px] tracking-wide text-muted-foreground uppercase">
              {tg("selected")}
            </span>
            {selectedTags.map((t) => (
              <Badge
                key={t.id}
                variant="default"
                className="cursor-pointer"
                onClick={() => handleToggle(t.id)}
              >
                #{t.name} ×
              </Badge>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
