import { durationText, learnerStatus } from "./learner-status"

describe("learnerStatus", () => {
  const today = "2026-10-28"

  it.each([
    ["COMPLETED", "2026-10-01", "COMPLETED", "completed", undefined],
    ["OVERDUE", "2026-10-27", "OVERDUE", "overdueDays", 1],
    ["OVERDUE", "2026-10-25", "OVERDUE", "overdueDays", 3],
    ["NOT_STARTED", "2026-10-28", "DUE_SOON", "dueToday", undefined],
    ["IN_PROGRESS", "2026-10-29", "DUE_SOON", "dueTomorrow", undefined],
    ["NOT_STARTED", "2026-11-04", "DUE_SOON", "dueInDays", 7],
    ["NOT_STARTED", "2026-11-05", "NOT_STARTED", "notStarted", undefined],
    ["IN_PROGRESS", "2026-11-05", "IN_PROGRESS", "inProgress", undefined],
    ["IN_PROGRESS", null, "IN_PROGRESS", "inProgress", undefined],
    ["NOT_STARTED", null, "NOT_STARTED", "notStarted", undefined],
  ] as const)("%s due %s → %s (%s)", (state, dueAt, kind, label, days) => {
    expect(learnerStatus(state, dueAt, today)).toEqual({
      kind,
      label,
      ...(days !== undefined ? { days } : {}),
    })
  })
})

describe("durationText", () => {
  it.each([
    [0, null],
    [12, "~12 min"],
    [60, "~1 h"],
    [80, "~1 h 20 min"],
  ] as const)("%s minutes → %s", (minutes, text) => {
    expect(durationText(minutes)).toBe(text)
  })
})
