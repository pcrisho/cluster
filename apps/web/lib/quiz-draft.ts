import type { QuizContent, QuizQuestion } from "./grow-api"

/** Ids the API accepts: letters, digits, `_` and `-`. */
const id = () => crypto.randomUUID()

export function newQuestion(type: QuizQuestion["type"]): QuizQuestion {
  if (type === "open") return { id: id(), type, prompt: "", points: 1 }
  return {
    id: id(),
    type,
    prompt: "",
    points: 1,
    options: [
      { id: id(), text: "" },
      { id: id(), text: "" },
    ],
    correct: [],
  }
}

/** The True/False preset: a single-choice question with those two options. */
export function trueFalse(
  q: QuizQuestion,
  labels = { true: "True", false: "False" }
): QuizQuestion {
  return {
    id: q.id,
    type: "single",
    prompt: q.prompt,
    points: q.points,
    options: [
      { id: id(), text: labels.true },
      { id: id(), text: labels.false },
    ],
    correct: [],
  }
}

/** The same question as another type, keeping what still applies. */
export function withType(
  q: QuizQuestion,
  type: QuizQuestion["type"]
): QuizQuestion {
  if (type === q.type) return q
  const base = { id: q.id, prompt: q.prompt, points: q.points }
  if (type === "open") return { ...base, type }
  if (q.type === "open")
    return {
      ...base,
      type,
      options: [
        { id: id(), text: "" },
        { id: id(), text: "" },
      ],
      correct: [],
    }
  return {
    ...base,
    type,
    options: q.options,
    correct: type === "single" ? q.correct.slice(0, 1) : q.correct,
  }
}

export type QuizProblem =
  | { code: "promptRequired" }
  | { code: "optionTextRequired" }
  | { code: "correctOptionRequired" | "correctOptionsRequired" }
  | {
      code: "bankTooLarge"
      bankSize: number
      questionCount: number
    }

/** What the API would refuse, by question id (and `quiz` for the settings). */
export function quizProblems(quiz: QuizContent): Record<string, QuizProblem[]> {
  const out: Record<string, QuizProblem[]> = {}
  for (const q of quiz.questions) {
    const problems: QuizProblem[] = []
    if (!q.prompt.trim()) problems.push({ code: "promptRequired" })
    if (q.type !== "open") {
      if (q.options.some((o) => !o.text.trim()))
        problems.push({ code: "optionTextRequired" })
      if (q.correct.length === 0)
        problems.push({
          code:
            q.type === "single"
              ? "correctOptionRequired"
              : "correctOptionsRequired",
        })
    }
    if (problems.length) out[q.id] = problems
  }
  const count = quiz.questions.length
  if (quiz.bankSize !== null && quiz.bankSize > count)
    out.quiz = [
      { code: "bankTooLarge", bankSize: quiz.bankSize, questionCount: count },
    ]
  return out
}

/** Counts used to render a localized quiz summary. */
export function quizSummary(quiz: QuizContent) {
  const count = quiz.questions.length
  const points = quiz.questions.reduce((sum, q) => sum + q.points, 0)
  return { questionCount: count, points, bankSize: quiz.bankSize }
}
