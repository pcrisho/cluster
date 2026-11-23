"use client"

import { SmilePlusIcon } from "lucide-react"

import type { PageDetail } from "@/lib/know-api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CollabTitleEditor } from "@/components/know/collab-title-editor"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { EntityIconPicker } from "@/components/shared/entity-icon-picker"
import type { CollabSnapshot } from "@/lib/collab/collab-session"
import { useTranslations } from "next-intl"

interface PageTitleBlockProps {
  page: PageDetail
  collab: CollabSnapshot | null
  /** The live title is shown instead of the REST copy. */
  live: boolean
  titleEditable: boolean
  canChangeIcon: boolean
  onTitleChange: (title: string) => void
  onIconChange: (next: {
    iconType: PageDetail["iconType"]
    icon: string
    emoji: string | null
  }) => void
  onIconRemove: () => void
}

/** Icon and title. A page that never got an icon shows none; editors get a small "Add icon". */
export function PageTitleBlock({
  page,
  collab,
  live,
  titleEditable,
  canChangeIcon,
  onTitleChange,
  onIconChange,
  onIconRemove,
}: PageTitleBlockProps) {
  const tk = useTranslations("know")
  const t = useTranslations("know.page")
  const hasIcon =
    page.iconType === "EMOJI" ? !!page.emoji : !!page.icon && page.icon !== "file-text"
  const glyph = (
    <EntityGlyph
      iconType={page.iconType}
      icon={page.icon}
      emoji={page.emoji}
      size="xl"
      className="text-muted-foreground"
    />
  )

  return (
    <div className="space-y-2">
      {canChangeIcon ? (
        <EntityIconPicker
          current={{
            iconType: page.iconType,
            icon: page.icon || "file-text",
            emoji: page.emoji,
          }}
          onChange={onIconChange}
          onRemove={onIconRemove}
        >
          {hasIcon ? (
            <Button variant="ghost" className="h-auto w-fit p-1" aria-label={t("changeIcon")}>
              {glyph}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <SmilePlusIcon data-icon="inline-start" />
              {t("addIcon")}
            </Button>
          )}
        </EntityIconPicker>
      ) : (
        hasIcon && <div className="w-fit p-1">{glyph}</div>
      )}

      {live && collab ? (
        <CollabTitleEditor
          key={collab.generation}
          ydoc={collab.ydoc}
          editable={titleEditable}
          onTitleChange={onTitleChange}
        />
      ) : (
        <h1
          className={cn(
            "text-[2.5rem] leading-[1.15] font-bold tracking-tight",
            !page.title.trim() && "text-muted-foreground/50"
          )}
        >
          {page.title.trim() || tk("untitled")}
        </h1>
      )}
    </div>
  )
}
