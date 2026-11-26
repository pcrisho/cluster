import type { QuizContent } from "./grow-api"
import {
  newQuestion,
  quizProblems,
  quizSummary,
  trueFalse,
  withType,
} from "./quiz-draft"

const quiz = (patch: Partial<QuizContent> = {}): QuizContent => ({
  passScore: 80,
  bankSize: null,
  shuffle: false,
  showCorrectAnswers: false,
  questions: [],
  ...patch,
})

describe("quizProblems", () => {
  it("a new question needs a prompt, option texts and a correct option", () => {
    const q = newQuestion("single")
    expect(quizProblems(quiz({ questions: [q] }))[q.id]).toEqual([
      { code: "promptRequired" },
      { code: "optionTextRequired" },
      { code: "correctOptionRequired" },
    ])
  })

  it("a complete question has no problems", () => {
    const q = {
      ...newQuestion("multiple"),
      prompt: "Pick",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correct: ["a", "b"],
    }
    expect(quizProblems(quiz({ questions: [q] }))).toEqual({})
  })

  it("flags a bank larger than the questions", () => {
    const q = { ...newQuestion("open"), prompt: "Why?" }
    expect(quizProblems(quiz({ questions: [q], bankSize: 2 })).quiz).toEqual([
      { code: "bankTooLarge", bankSize: 2, questionCount: 1 },
    ])
  })
})

describe("question helpers", () => {
  it("true/false is a single-choice question with two options", () => {
    const q = trueFalse(newQuestion("single"))
    expect(q.type).toBe("single")
    if (q.type === "open") throw new Error("unexpected")
    expect(q.options.map((o) => o.text)).toEqual(["True", "False"])
    expect(q.correct).toEqual([])
  })

  it("switching to single keeps at most one correct option; to open drops options", () => {
    const multi = {
      ...newQuestion("multiple"),
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correct: ["a", "b"],
    }
    const single = withType(multi, "single")
    expect(single.type === "single" && single.correct).toEqual(["a"])
    const open = withType(multi, "open")
    expect(open).not.toHaveProperty("options")
    expect(open.prompt).toBe(multi.prompt)
  })

  it("summarises questions, points and the bank", () => {
    const q = { ...newQuestion("open"), prompt: "Why?", points: 2 }
    expect(quizSummary(quiz({ questions: [q, { ...q, id: "x" }] }))).toEqual({
      questionCount: 2,
      points: 4,
      bankSize: null,
    })
    expect(
      quizSummary(quiz({ questions: [q, { ...q, id: "x" }], bankSize: 1 }))
    ).toEqual({ questionCount: 2, points: 4, bankSize: 1 })
  })
})
