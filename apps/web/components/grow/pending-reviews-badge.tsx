import Link from "next/link"
import { HourglassIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { StatusBadge } from "@/components/ui/status-badge"

/** "3 to review", linking to the course's review queue; nothing when there is none. */
export function PendingReviewsBadge({
  courseId,
  count,
}: {
  courseId: string
  count: number
}) {
  const t = useTranslations("grow")
  if (count === 0) return null
  return (
    <StatusBadge asChild tone="warning" icon={HourglassIcon}>
      <Link href={`/grow/courses/${courseId}/reviews`}>
        {t("reviewsPending", { count })}
      </Link>
    </StatusBadge>
  )
}
