import type { QuizAttempt } from "@prisma/client";
import { attemptForLearner, attemptForReviewer } from "./attempt-dto";
import type { Question } from "./quiz-content";

const questions: Question[] = [
  {
    id: "s",
    type: "single",
    prompt: "Pick A",
    points: 1,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correct: ["a"],
  },
  {
    id: "o",
    type: "open",
    prompt: "Why?",
    points: 2,
    guidance: "Mentions risk",
  },
];
const attempt = (patch: Partial<QuizAttempt>): QuizAttempt => ({
  id: "att",
  enrollmentId: "enr",
  organizationId: "org",
  stepId: "step",
  status: "IN_PROGRESS",
  questions: questions as never,
  passScore: 50,
  answers: null,
  openScores: null,
  score: null,
  passed: null,
  startedAt: new Date("2026-10-28T10:00:00Z"),
  submittedAt: null,
  gradedAt: null,
  gradedById: null,
  ...patch,
});

describe("attemptForLearner", () => {
  it("never carries the answer key or the grader's guidance while in progress", () => {
    const shown = attemptForLearner(attempt({}), { revealAnswers: true });
    const text = JSON.stringify(shown);
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain("guidance");
    expect(text).not.toContain("Mentions risk");
    expect(shown.questions[0]).toEqual({
      id: "s",
      type: "single",
      prompt: "Pick A",
      points: 1,
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      answer: null,
      result: null,
      correctOptions: null,
    });
  });

  it("after grading shows which answers were wrong, and the right options only when revealed", () => {
    const graded = attempt({
      status: "GRADED",
      answers: { s: ["b"], o: "Because" },
      openScores: { o: 2 },
      score: 66.7,
      passed: true,
      submittedAt: new Date(),
    });
    const hidden = attemptForLearner(graded, { revealAnswers: false });
    expect(hidden.questions.map((q) => q.result)).toEqual([
      { correct: false, earned: 0 },
      { correct: true, earned: 2 },
    ]);
    expect(JSON.stringify(hidden)).not.toContain('"correctOptions":["a"]');

    const shown = attemptForLearner(graded, { revealAnswers: true });
    expect(shown.questions[0].correctOptions).toEqual(["a"]);
    expect(shown.questions[1].correctOptions).toBeNull();
  });

  it("a written answer waiting for review has no result yet", () => {
    const pending = attempt({
      status: "PENDING_REVIEW",
      answers: { s: ["a"], o: "Because" },
      submittedAt: new Date(),
    });
    const shown = attemptForLearner(pending, { revealAnswers: false });
    expect(shown.questions[1].result).toEqual({ correct: null, earned: null });
    expect(shown.score).toBeNull();
  });
});

describe("attemptForReviewer", () => {
  it("includes the guidance, the key and the learner's answers", () => {
    const shown = attemptForReviewer(
      attempt({ status: "PENDING_REVIEW", answers: { o: "Because" } }),
    );
    expect(shown.questions[1]).toMatchObject({
      guidance: "Mentions risk",
      answer: "Because",
    });
    expect(shown.questions[0]).toMatchObject({ correct: ["a"] });
  });
});
