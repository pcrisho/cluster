import type { StepType } from "@prisma/client";
import type { QuizContent } from "./quiz-content";

export type PublishProblem =
  | { code: "NO_STEPS" }
  | {
      code: "QUIZ_NEEDS_QUESTION" | "QUIZ_PASS_SCORE_INVALID";
      sectionId: string;
      stepId: string;
      title: string;
    }
  | {
      code: "QUIZ_BANK_TOO_LARGE";
      sectionId: string;
      stepId: string;
      title: string;
      bankSize: number;
      questionCount: number;
    };

/** Everything that keeps a course from being published (or restored); empty when it is ready. */
export function publishProblems(
  sections: {
    id: string;
    steps: { id: string; title: string; type: StepType; content: unknown }[];
  }[],
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (sections.every((s) => s.steps.length === 0))
    problems.push({ code: "NO_STEPS" });
  for (const section of sections) {
    for (const step of section.steps) {
      if (step.type !== "QUIZ") continue;
      const quiz = step.content as QuizContent;
      const at = { sectionId: section.id, stepId: step.id };
      const count = quiz.questions.length;
      if (count === 0)
        problems.push({
          ...at,
          code: "QUIZ_NEEDS_QUESTION",
          title: step.title,
        });
      else if (quiz.bankSize !== null && quiz.bankSize > count) {
        problems.push({
          ...at,
          code: "QUIZ_BANK_TOO_LARGE",
          title: step.title,
          bankSize: quiz.bankSize,
          questionCount: count,
        });
      }
      if (
        !Number.isInteger(quiz.passScore) ||
        quiz.passScore < 0 ||
        quiz.passScore > 100
      ) {
        problems.push({
          ...at,
          code: "QUIZ_PASS_SCORE_INVALID",
          title: step.title,
        });
      }
    }
  }
  return problems;
}
