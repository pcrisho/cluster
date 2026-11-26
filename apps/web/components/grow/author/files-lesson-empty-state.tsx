"use client"

import { FileIcon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

interface FilesLessonEmptyStateProps {
  onSelect: () => void
}

export function FilesLessonEmptyState({
  onSelect,
}: FilesLessonEmptyStateProps) {
  const t = useTranslations("grow.lessonFiles")

  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileIcon />
        </EmptyMedia>
        <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onSelect}>
          <UploadIcon data-icon="inline-start" />
          {t("chooseFiles")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("fileLimits")}</p>
      </EmptyContent>
    </Empty>
  )
}
