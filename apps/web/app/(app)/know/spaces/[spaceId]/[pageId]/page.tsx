"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { FileQuestionIcon } from "lucide-react"

import { knowApi, type PageDetail, type Tag } from "@/lib/know-api"
import { canEditSpace } from "@/lib/know-roles"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { PageContentSkeleton } from "@/components/know/know-skeleton"
import { PageCanvas } from "@/components/know/page/page-canvas"
import { useSpace } from "@/components/know/space/space-context"
import { useTranslations } from "next-intl"

export default function PageView() {
  const t = useTranslations("know.pageView")
  const { pageId } = useParams<{ pageId: string }>()
  const { space, pages, spaceId, refresh } = useSpace()
  const [page, setPage] = useState<PageDetail | null>(null)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const fetchPage = useCallback(async () => {
    try {
      const [pageResult, tagsResult] = await Promise.all([
        knowApi.getPage(pageId),
        knowApi.getTags(),
      ])
      setPage(pageResult.data)
      setAvailableTags(tagsResult.data)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setIsLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    Promise.resolve().then(fetchPage)
  }, [fetchPage])

  // The sidebar tree shows titles, status and position, so it follows every change.
  const handleChanged = useCallback(() => {
    void fetchPage()
    void refresh()
  }, [fetchPage, refresh])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
        <PageContentSkeleton />
      </div>
    )
  }

  if (failed || !page || !space) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>{t("notFound")}</EmptyTitle>
          <EmptyDescription>{t("notFoundBody")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href={`/know/spaces/${spaceId}`}>{t("backToSpace")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <PageCanvas
      key={page.id}
      page={page}
      space={space}
      pages={pages}
      availableTags={availableTags}
      canEdit={canEditSpace(page.space.myRole)}
      onChanged={handleChanged}
    />
  )
}
