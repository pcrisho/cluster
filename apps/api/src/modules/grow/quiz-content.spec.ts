import { EMPTY_QUIZ, parseQuizContent } from "./quiz-content";

const single = {
  id: "q1",
  type: "single",
  prompt: "2+2?",
  points: 1,
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "5" },
  ],
  correct: ["a"],
};
const multiple = {
  id: "q2",
  type: "multiple",
  prompt: "Even?",
  points: 2,
  options: [
    { id: "a", text: "2" },
    { id: "b", text: "4" },
    { id: "c", text: "5" },
  ],
  correct: ["a", "b"],
};
const open = {
  id: "q3",
  type: "open",
  prompt: "Explain",
  points: 3,
  guidance: "Mentions oxygen",
};
const quiz = (patch: object = {}) => ({
  ...EMPTY_QUIZ,
  questions: [single, multiple, open],
  ...patch,
});

describe("parseQuizContent", () => {
  it("accepts a valid quiz and drops unknown fields", () => {
    const parsed = parseQuizContent({
      ...quiz(),
      extra: true,
      questions: [{ ...single, extra: 1 }, multiple, open],
    });
    expect(parsed).toEqual(quiz());
    expect(parseQuizContent(EMPTY_QUIZ)).toEqual(EMPTY_QUIZ);
  });

  it("rejects bad settings", () => {
    for (const patch of [
      { passScore: 101 },
      { passScore: -1 },
      { passScore: 50.5 },
      { bankSize: 0 },
      { shuffle: "yes" },
    ]) {
      expect(() => parseQuizContent(quiz(patch))).toThrow();
    }
  });

  it("rejects questions without a valid answer key", () => {
    const bad = [
      { ...single, correct: [] },
      { ...single, correct: ["a", "b"] },
      { ...single, correct: ["z"] },
      { ...multiple, correct: [] },
      { ...single, options: [{ id: "a", text: "4" }] },
      {
        ...single,
        options: [
          { id: "a", text: "4" },
          { id: "a", text: "5" },
        ],
      },
      { ...single, prompt: "" },
      { ...single, points: 0 },
      { ...single, type: "essay" },
    ];
    for (const question of bad)
      expect(() => parseQuizContent(quiz({ questions: [question] }))).toThrow();
    expect(() =>
      parseQuizContent(
        quiz({ questions: [single, { ...multiple, id: "q1" }] }),
      ),
    ).toThrow("unique id");
  });
});
