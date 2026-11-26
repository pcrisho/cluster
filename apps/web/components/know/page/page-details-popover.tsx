"use client"

import { CornerDownLeftIcon, InfoIcon, PlusIcon, TagsIcon } from "lucide-react"

import type { PageDetail, PageStatus, PageTreeNode, Tag } from "@/lib/know-api"
import { pageTitle } from "@/lib/page-title"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageParentPicker } from "@/components/know/page-parent-picker"
import { PageTagsEditor } from "@/components/know/page-tags-editor"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

interface PageDetailsPopoverProps {
  page: PageDetail
  pageTree: PageTreeNode[]
  availableTags: Tag[]
  canEdit: boolean
  onStatusChange: (status: PageStatus) => void
  onParentChange: (parentId: string | null) => void
  onTagsChange: (tagIds: string[]) => void
}

/** In menu order; each status's name is `know.status.<STATUS>`. */
const STATUSES: PageStatus[] = ["PUBLISHED", "DRAFT", "ARCHIVED"]

/** Everything about a page that is not its text: status, place in the tree, tags, authorship. */
export function PageDetailsPopover({
  page,
  pageTree,
  availableTags,
  canEdit,
  onStatusChange,
  onParentChange,
  onTagsChange,
}: PageDetailsPopoverProps) {
  const dates = useDates()
  const t = useTranslations("know.details")
  const ts = useTranslations("know.status")
  const tagIds = page.tags?.map((t) => t.tag.id) ?? []
  const parent = pageTree.find((p) => p.id === page.parentId)
  const author = page.author
    ? `${page.author.firstName} ${page.author.lastName}`
    : t("unknown")
  const versions = page._count?.versions ?? 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <InfoIcon data-icon="inline-start" />
          {t("details")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4">
        <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t("status")}</dt>
          <dd>
            {canEdit ? (
              <Select
                value={page.status}
                onValueChange={(v) => onStatusChange(v as PageStatus)}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={t("status")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ts(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{ts(page.status)}</Badge>
            )}
          </dd>

          <dt className="text-muted-foreground">{t("parent")}</dt>
          <dd className="min-w-0">
            {canEdit ? (
              <PageParentPicker
                pages={pageTree}
                value={page.parentId}
                onChange={onParentChange}
                currentPageId={page.id}
              >
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <CornerDownLeftIcon data-icon="inline-start" />
                  <span className="truncate">
                    {parent ? pageTitle(parent.title) : t("topLevel")}
                  </span>
                </Button>
              </PageParentPicker>
            ) : (
              <span className="truncate">
                {parent ? pageTitle(parent.title) : t("topLevel")}
              </span>
            )}
          </dd>

          <dt className="text-muted-foreground">{t("tags")}</dt>
          <dd className="flex flex-wrap items-center gap-1">
            {tagIds.map((id) => {
              const tag = availableTags.find((t) => t.id === id)
              return tag ? (
                <Badge key={id} variant="secondary">
                  <TagsIcon data-icon="inline-start" />
                  {tag.name}
                </Badge>
              ) : null
            })}
            {canEdit && (
              <PageTagsEditor
                availableTags={availableTags}
                value={tagIds}
                onChange={onTagsChange}
              >
                <Button variant="outline" size="xs">
                  <PlusIcon data-icon="inline-start" />
                  {tagIds.length === 0 ? t("addTag") : t("edit")}
                </Button>
              </PageTagsEditor>
            )}
            {!canEdit && tagIds.length === 0 && (
              <span className="text-muted-foreground">{t("none")}</span>
            )}
          </dd>
        </dl>

        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 border-t pt-4 text-sm">
          <dt className="text-muted-foreground">{t("author")}</dt>
          <dd>{author}</dd>
          <dt className="text-muted-foreground">{t("updated")}</dt>
          <dd>{dates.relative(page.updatedAt)}</dd>
          <dt className="text-muted-foreground">{t("versions")}</dt>
          <dd>{versions}</dd>
        </dl>
      </PopoverContent>
    </Popover>
  )
}
