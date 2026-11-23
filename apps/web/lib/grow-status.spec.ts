import {
  attemptStatus,
  courseStatus,
  learnerTone,
  questionResult,
} from "./grow-status"

describe("GROW status tones", () => {
  it("maps a learner's state, a near due date being a warning", () => {
    expect(learnerTone("NOT_STARTED")).toBe("neutral")
    expect(learnerTone("IN_PROGRESS")).toBe("info")
    expect(learnerTone("DUE_SOON")).toBe("warning")
    expect(learnerTone("OVERDUE")).toBe("danger")
    expect(learnerTone("COMPLETED")).toBe("success")
  })

  it("maps a course's lifecycle", () => {
    expect(courseStatus("DRAFT")).toEqual({ tone: "neutral", label: "Draft" })
    expect(courseStatus("PUBLISHED")).toEqual({
      tone: "success",
      label: "Published",
    })
    expect(courseStatus("ARCHIVED")).toEqual({
      tone: "neutral",
      label: "Archived",
    })
  })

  it("maps a quiz attempt", () => {
    expect(attemptStatus("IN_PROGRESS").tone).toBe("info")
    expect(attemptStatus("PENDING_REVIEW")).toEqual({
      tone: "warning",
      label: "Pending review",
    })
    expect(attemptStatus("PASSED").tone).toBe("success")
    expect(attemptStatus("FAILED")).toEqual({
      tone: "danger",
      label: "Not passed",
    })
  })

  it("maps a question's result", () => {
    expect(questionResult("CORRECT").tone).toBe("success")
    expect(questionResult("INCORRECT").tone).toBe("danger")
    expect(questionResult("PENDING").tone).toBe("warning")
  })
})
