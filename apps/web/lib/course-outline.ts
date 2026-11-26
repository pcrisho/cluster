import type { CourseOverview, OutlineStep } from "./grow-api"

/** Every step in the order a learner meets them. */
export function flatSteps(course: Pick<CourseOverview, "sections">) {
  return course.sections.flatMap((s) => s.steps)
}

/** Structured metadata so the learner-facing label is rendered in the active locale. */
export function stepMeta(step: OutlineStep) {
  if (step.quiz)
    return {
      kind: "quiz" as const,
      questionCount: step.quiz.questionCount,
      passScore: step.quiz.passScore,
      pendingReview: step.quiz.pendingReview,
      attempts: step.quiz.attempts,
      best: step.quiz.best,
    }
  return {
    kind: "lesson" as const,
    durationMinutes: step.durationMinutes ?? 0,
  }
}

/** The player URL of a step; previews keep `?preview=1`. */
export function stepHref(courseId: string, stepId: string, preview: boolean) {
  return `/grow/courses/${courseId}/learn/${stepId}${preview ? "?preview=1" : ""}`
}

/**
 * The step a learner must finish before `stepId`, as the API decides it (`blockingStep`): the first
 * required, not completed step before it, when the outline marks it locked. Lets the player show
 * the lock without asking for a step it cannot have.
 */
export function blockerOf(
  course: Pick<CourseOverview, "sections">,
  stepId: string
): OutlineStep | null {
  const steps = flatSteps(course)
  const index = steps.findIndex((s) => s.id === stepId)
  if (index < 0 || !steps[index].locked) return null
  return steps.slice(0, index).find((s) => s.required && !s.completed) ?? null
}
