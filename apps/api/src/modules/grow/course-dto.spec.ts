import type { CourseStep } from "@prisma/client";
import { stepForAuthor, stepForLearner } from "./course-dto";
import { publishProblems } from "./course-publish";
import { EMPTY_QUIZ } from "./quiz-content";

const question = {
  id: "q1",
  type: "single",
  prompt: "?",
  points: 1,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correct: ["a"],
};
const open = {
  id: "q2",
  type: "open",
  prompt: "Why?",
  points: 2,
  guidance: "secret rubric",
};
const step = (patch: Partial<CourseStep>): CourseStep => ({
  id: "s1",
  courseId: "c1",
  organizationId: "org",
  sectionId: "sec1",
  type: "LESSON",
  title: "Step",
  position: 0,
  required: true,
  durationMinutes: null,
  content: {},
  ...patch,
});

describe("step shapers", () => {
  const quiz = step({
    type: "QUIZ",
    content: { ...EMPTY_QUIZ, bankSize: 5, questions: [question, open] },
  });

  it("authors get the answer key and the grader guidance", () => {
    const json = JSON.stringify(stepForAuthor(quiz));
    expect(json).toContain('"correct"');
    expect(json).toContain("secret rubric");
  });

  it("learners get a quiz's rules only, never its questions or answers", () => {
    const shaped = stepForLearner(quiz);
    expect(shaped.content).toEqual({
      passScore: 80,
      questionCount: 2,
      showCorrectAnswers: false,
    });
    const json = JSON.stringify(shaped);
    for (const leak of [
      '"correct"',
      '"questions"',
      "secret rubric",
      '"options"',
    ])
      expect(json).not.toContain(leak);
  });

  it("authors also get a link's embed URL, for the preview", () => {
    const link = step({
      content: { kind: "link", url: "https://vimeo.com/76979871" },
    });
    expect(stepForAuthor(link).content).toMatchObject({
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("learners get a link lesson with its embed URL", () => {
    const link = step({
      content: { kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    expect(stepForLearner(link).content).toEqual({
      kind: "link",
      url: "https://youtu.be/dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });
});

describe("publishProblems", () => {
  const quizStep = (id: string, content: object) => ({
    id,
    title: id,
    type: "QUIZ" as const,
    content,
  });
  const lesson = {
    id: "l1",
    title: "Intro",
    type: "LESSON" as const,
    content: {},
  };

  it("is empty for a course with a lesson and a complete quiz", () => {
    expect(
      publishProblems([
        {
          id: "s",
          steps: [
            lesson,
            quizStep("q", { ...EMPTY_QUIZ, questions: [question] }),
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("lists every problem, each pointing at its step", () => {
    expect(publishProblems([{ id: "s", steps: [] }])).toEqual([
      { code: "NO_STEPS" },
    ]);
    const problems = publishProblems([
      {
        id: "s",
        steps: [
          quizStep("empty", EMPTY_QUIZ),
          quizStep("bank", {
            ...EMPTY_QUIZ,
            bankSize: 3,
            questions: [question],
          }),
          quizStep("score", {
            ...EMPTY_QUIZ,
            passScore: 120,
            questions: [question],
          }),
        ],
      },
    ]);
    expect(problems.map((p) => p.code)).toEqual([
      "QUIZ_NEEDS_QUESTION",
      "QUIZ_BANK_TOO_LARGE",
      "QUIZ_PASS_SCORE_INVALID",
    ]);
    expect(problems).toMatchObject([
      { sectionId: "s", stepId: "empty" },
      { sectionId: "s", stepId: "bank", bankSize: 3, questionCount: 1 },
      { sectionId: "s", stepId: "score" },
    ]);
  });
});
