export type LearnerState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE"

export type LearnerStatusKind = LearnerState | "DUE_SOON"
export type LearnerStatusLabel =
  | "completed"
  | "overdue"
  | "overdueDays"
  | "dueToday"
  | "dueTomorrow"
  | "dueInDays"
  | "inProgress"
  | "notStarted"

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from one calendar date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  )
}

/** The chip a learner sees: completed and overdue first; a due date within 7 days beats in progress / not started. */
export function learnerStatus(
  state: LearnerState,
  dueAt: string | null,
  today: string
): {
  kind: LearnerStatusKind
  label: LearnerStatusLabel
  days?: number
} {
  if (state === "COMPLETED") return { kind: state, label: "completed" }
  if (state === "OVERDUE")
    return {
      kind: state,
      label: dueAt ? "overdueDays" : "overdue",
      ...(dueAt ? { days: daysBetween(dueAt, today) } : {}),
    }
  const left = dueAt === null ? null : daysBetween(today, dueAt)
  if (left !== null && left >= 0 && left <= 7)
    return {
      kind: "DUE_SOON",
      label: left === 0 ? "dueToday" : left === 1 ? "dueTomorrow" : "dueInDays",
      ...(left > 1 ? { days: left } : {}),
    }
  return state === "IN_PROGRESS"
    ? { kind: state, label: "inProgress" }
    : { kind: state, label: "notStarted" }
}

/** "~12 min", "~1 h 20 min"; null when no lesson has a duration. */
export function durationText(minutes: number): string | null {
  if (minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `~${m} min`
  return m === 0 ? `~${h} h` : `~${h} h ${m} min`
}
