import Link from "next/link"
import { GraduationCapIcon, TriangleAlertIcon } from "lucide-react"
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

/** The same view for a missing course and one the person cannot open, so existence is not revealed. */
export function CourseNotFound() {
  const t = useTranslations("grow")

  return (
    <Empty className="py-20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GraduationCapIcon />
        </EmptyMedia>
        <EmptyTitle>{t("courseNotFound")}</EmptyTitle>
        <EmptyDescription>{t("courseNotFoundBody")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/grow">{t("backToLearning")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function CourseLoadError({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  const t = useTranslations("grow")

  return (
    <Empty className="py-20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t("courseLoadFailed")}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {t("retry")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
