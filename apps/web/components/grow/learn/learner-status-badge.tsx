import { SparkleIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { learnerTone } from "@/lib/grow-status"
import { learnerStatus, type LearnerState } from "@/lib/learner-status"
import { useDates } from "@/lib/i18n/use-dates"
import { StatusBadge } from "@/components/ui/status-badge"
import { LEARNER_STATUS_ICON } from "@/components/grow/learner-status-icons"

/** A learner's state in a course, always as icon and label; a near due date shows instead of in progress / not started. */
export function LearnerStatusBadge({
  state,
  dueAt,
  className,
}: {
  state: LearnerState
  dueAt: string | null
  className?: string
}) {
  const t = useTranslations("grow.learnerStatus")
  const dates = useDates()
  const { kind, label, days } = learnerStatus(state, dueAt, dates.today())
  const text =
    label === "overdueDays" || label === "dueInDays"
      ? t(label, { days: days ?? 0 })
      : t(label)
  return (
    <StatusBadge
      tone={learnerTone(kind)}
      icon={LEARNER_STATUS_ICON[kind]}
      className={className}
    >
      {text}
    </StatusBadge>
  )
}

/** Reached by a mandatory assignment in the last 7 days and not started. */
export function NewBadge() {
  const t = useTranslations("grow.learnerStatus")
  return (
    <StatusBadge tone="info" icon={SparkleIcon}>
      {t("new")}
    </StatusBadge>
  )
}
