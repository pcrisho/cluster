import { blockerOf, stepMeta } from "./course-outline"
import type { OutlineStep } from "./grow-api"

const step = (id: string, over: Partial<OutlineStep> = {}) =>
  ({
    id,
    title: id,
    required: true,
    completed: false,
    locked: false,
    ...over,
  }) as OutlineStep

const course = (...steps: OutlineStep[]) =>
  ({
    sections: [{ steps: steps.slice(0, 2) }, { steps: steps.slice(2) }],
  }) as Parameters<typeof blockerOf>[0]

describe("blockerOf", () => {
  it("is the first required step not completed before a locked one, across sections", () => {
    const c = course(
      step("a", { completed: true }),
      step("b", { required: false }),
      step("c"),
      step("d", { locked: true })
    )
    expect(blockerOf(c, "d")?.id).toBe("c")
  })

  it("is nothing for a step the outline does not lock", () => {
    const c = course(step("a"), step("b"))
    expect(blockerOf(c, "b")).toBeNull()
    expect(blockerOf(c, "missing")).toBeNull()
  })
})

describe("stepMeta", () => {
  it("returns quiz data for localized rendering", () => {
    expect(
      stepMeta(
        step("quiz", {
          quiz: {
            questionCount: 3,
            passScore: 80,
            attempts: 2,
            best: 90,
            pendingReview: true,
            inProgress: false,
            lastAttemptId: "attempt",
            showCorrectAnswers: false,
          },
        })
      )
    ).toEqual({
      kind: "quiz",
      questionCount: 3,
      passScore: 80,
      pendingReview: true,
      attempts: 2,
      best: 90,
    })
  })

  it("returns lesson duration without presentation copy", () => {
    expect(stepMeta(step("lesson", { durationMinutes: 5 }))).toEqual({
      kind: "lesson",
      durationMinutes: 5,
    })
  })
})
