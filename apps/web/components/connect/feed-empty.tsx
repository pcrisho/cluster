"use client"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "components/ui/empty"
import { StickyNoteOff } from "lucide-react"
import { useTranslations } from "next-intl"

export function FeedEmpty() {
  const t = useTranslations("connect.feed")
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <Empty>
        <EmptyContent>
          <EmptyHeader>
            <EmptyMedia variant={"icon"}>
              <StickyNoteOff />
            </EmptyMedia>
            <EmptyTitle>{t("empty")}</EmptyTitle>
            <EmptyDescription>{t("emptyBody")}</EmptyDescription>
          </EmptyHeader>
        </EmptyContent>
      </Empty>
    </div>
  )
}
