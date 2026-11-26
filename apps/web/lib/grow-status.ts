import type { CourseStatus, ReportState } from "@/lib/grow-api"
import type { LearnerStatusKind } from "@/lib/learner-status"
import type { Tone } from "@/lib/tone"

// Status tones for GROW (`docs/specs/grow/ui-polish/design.md` §3); primary never carries state.

/** A learner's state in a course; a near due date is a warning, not progress. */
export function learnerTone(kind: LearnerStatusKind | ReportState): Tone {
  switch (kind) {
    case "COMPLETED":
      return "success"
    case "OVERDUE":
      return "danger"
    case "DUE_SOON":
      return "warning"
    case "IN_PROGRESS":
      return "info"
    case "NOT_STARTED":
      return "neutral"
  }
}

const COURSE: Record<CourseStatus, { tone: Tone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  PUBLISHED: { tone: "success", label: "Published" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
}

export function courseStatus(status: CourseStatus) {
  return COURSE[status]
}

export type AttemptOutcome =
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "PASSED"
  | "FAILED"

const ATTEMPT: Record<AttemptOutcome, { tone: Tone; label: string }> = {
  IN_PROGRESS: { tone: "info", label: "In progress" },
  PENDING_REVIEW: { tone: "warning", label: "Pending review" },
  PASSED: { tone: "success", label: "Passed" },
  FAILED: { tone: "danger", label: "Not passed" },
}

export function attemptStatus(outcome: AttemptOutcome) {
  return ATTEMPT[outcome]
}

export type QuestionResult = "CORRECT" | "INCORRECT" | "PENDING"

const QUESTION: Record<QuestionResult, { tone: Tone; label: string }> = {
  CORRECT: { tone: "success", label: "Correct" },
  INCORRECT: { tone: "danger", label: "Incorrect" },
  PENDING: { tone: "warning", label: "Pending review" },
}

export function questionResult(result: QuestionResult) {
  return QUESTION[result]
}
