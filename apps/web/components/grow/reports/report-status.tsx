import { useTranslations } from "next-intl"

import { learnerTone } from "@/lib/grow-status"
import { learnerStatus, type LearnerStatusLabel } from "@/lib/learner-status"
import { useDates } from "@/lib/i18n/use-dates"
import type { ReportState } from "@/lib/grow-api"
import { StatusBadge } from "@/components/ui/status-badge"
import { LEARNER_STATUS_ICON } from "@/components/grow/learner-status-icons"

const LABEL = {
  NOT_STARTED: "notStarted",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
  OVERDUE: "overdue",
} as const satisfies Record<ReportState, LearnerStatusLabel>

export function reportStatusLabel(state: ReportState): LearnerStatusLabel {
  return LABEL[state]
}

export function ReportStatus({
  state,
  dueAt,
  variant = "badge",
}: {
  state: ReportState
  dueAt?: string | null
  variant?: "badge" | "dot"
}) {
  const t = useTranslations("grow.learnerStatus")
  const dates = useDates()
  const { kind, label, days } = learnerStatus(
    state,
    dueAt ?? null,
    dates.today()
  )
  const text =
    label === "overdueDays" || label === "dueInDays"
      ? t(label, { days: days ?? 0 })
      : t(label)
  return (
    <StatusBadge
      tone={learnerTone(kind)}
      icon={LEARNER_STATUS_ICON[kind]}
      variant={variant}
    >
      {text}
    </StatusBadge>
  )
}
