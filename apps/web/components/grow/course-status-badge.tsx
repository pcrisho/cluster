import { ArchiveIcon, CircleCheckIcon, FilePenIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { CourseStatus } from "@/lib/grow-api"
import { courseStatus } from "@/lib/grow-status"
import { StatusBadge } from "@/components/ui/status-badge"

const ICON = {
  DRAFT: FilePenIcon,
  PUBLISHED: CircleCheckIcon,
  ARCHIVED: ArchiveIcon,
} as const
const LABEL = {
  DRAFT: "statusDraft",
  PUBLISHED: "statusPublished",
  ARCHIVED: "statusArchived",
} as const

/** A course's lifecycle state, always as icon and label (never colour alone). */
export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const { tone } = courseStatus(status)
  const t = useTranslations("grow")
  return (
    <StatusBadge tone={tone} icon={ICON[status]}>
      {t(LABEL[status])}
    </StatusBadge>
  )
}
