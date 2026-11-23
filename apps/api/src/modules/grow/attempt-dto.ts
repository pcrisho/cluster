import type { QuizAttempt } from "@prisma/client";
import { autoGrade, type Answers, type PerQuestion } from "./grade";
import type { Question } from "./quiz-content";

const snapshotOf = (attempt: QuizAttempt) =>
  attempt.questions as unknown as Question[];
const answersOf = (attempt: QuizAttempt) =>
  (attempt.answers ?? {}) as unknown as Answers;

/** Per question once submitted; written answers count once a reviewer scored them. */
function results(attempt: QuizAttempt): PerQuestion | null {
  if (attempt.status === "IN_PROGRESS") return null;
  const { perQuestion } = autoGrade(snapshotOf(attempt), answersOf(attempt));
  const scores = (attempt.openScores ?? {}) as Record<string, number>;
  for (const q of snapshotOf(attempt)) {
    const score = scores[q.id];
    if (q.type === "open" && score !== undefined)
      perQuestion[q.id] = { correct: score === q.points, earned: score };
  }
  return perQuestion;
}

/**
 * An attempt for the learner who owns it: questions without the answer key or grader guidance,
 * their answers, which were right once submitted, and the right options only when `revealAnswers`
 * (they passed the step and the quiz shows them).
 */
export function attemptForLearner(
  attempt: QuizAttempt,
  { revealAnswers }: { revealAnswers: boolean },
) {
  const answers = answersOf(attempt);
  const perQuestion = results(attempt);
  const reveal = revealAnswers && attempt.status === "GRADED";
  return {
    id: attempt.id,
    stepId: attempt.stepId,
    status: attempt.status,
    passScore: attempt.passScore,
    score: attempt.score,
    passed: attempt.passed,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    questions: snapshotOf(attempt).map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      ...(q.type !== "open" && {
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      }),
      answer: answers[q.id] ?? null,
      result: perQuestion?.[q.id] ?? null,
      correctOptions: reveal && q.type !== "open" ? q.correct : null,
    })),
  };
}

/** An attempt for a course manager grading it: everything, guidance and key included. */
export function attemptForReviewer(attempt: QuizAttempt) {
  const answers = answersOf(attempt);
  const perQuestion = results(attempt);
  return {
    id: attempt.id,
    stepId: attempt.stepId,
    status: attempt.status,
    passScore: attempt.passScore,
    score: attempt.score,
    passed: attempt.passed,
    submittedAt: attempt.submittedAt,
    questions: snapshotOf(attempt).map((q) => ({
      ...q,
      answer: answers[q.id] ?? null,
      result: perQuestion?.[q.id] ?? null,
    })),
  };
}
