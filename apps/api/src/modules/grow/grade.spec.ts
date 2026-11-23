import { BadRequestException } from "@nestjs/common";
import { autoGrade, finalScore, parseAnswers } from "./grade";
import type { Question } from "./quiz-content";

const snapshot: Question[] = [
  {
    id: "s",
    type: "single",
    prompt: "Single",
    points: 2,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correct: ["a"],
  },
  {
    id: "m",
    type: "multiple",
    prompt: "Multiple",
    points: 3,
    options: [
      { id: "x", text: "X" },
      { id: "y", text: "Y" },
      { id: "z", text: "Z" },
    ],
    correct: ["x", "y"],
  },
  { id: "o", type: "open", prompt: "Open", points: 5 },
];

describe("parseAnswers", () => {
  it("keeps valid answers and drops nothing silently", () => {
    expect(
      parseAnswers(snapshot, { s: ["a"], m: ["y", "x"], o: "  Because  " }),
    ).toEqual({ s: ["a"], m: ["y", "x"], o: "Because" });
  });

  it.each([
    ["a question that was not presented", { zz: ["a"] }],
    ["an option of another question", { s: ["x"] }],
    ["two options on a single-choice question", { s: ["a", "b"] }],
    ["text on a choice question", { s: "a" }],
    ["a list on an open question", { o: ["a"] }],
    ["an over-long open answer", { o: "x".repeat(5001) }],
    ["not an object", ["a"]],
  ])("rejects %s", (_name, answers) => {
    expect(() => parseAnswers(snapshot, answers)).toThrow(BadRequestException);
  });

  it("accepts unanswered questions", () => {
    expect(parseAnswers(snapshot, {})).toEqual({});
  });
});

describe("autoGrade", () => {
  it("grades choice questions all-or-nothing and leaves written answers pending", () => {
    const result = autoGrade(snapshot, { s: ["a"], m: ["x"], o: "text" });
    expect(result.perQuestion).toEqual({
      s: { correct: true, earned: 2 },
      m: { correct: false, earned: 0 },
      o: { correct: null, earned: null },
    });
    expect(result.openPending).toBe(true);
  });

  it("an unanswered open question needs no review and earns nothing", () => {
    const result = autoGrade(snapshot, { s: ["a"], m: ["y", "x"] });
    expect(result.openPending).toBe(false);
    expect(result.perQuestion.o).toEqual({ correct: false, earned: 0 });
  });
});

describe("finalScore", () => {
  it("is the percent of the presented points; passing is at or above the mark", () => {
    const graded = autoGrade(snapshot, { s: ["a"], m: ["x", "y"], o: "t" });
    // 2 + 3 + 3 of 10 points.
    expect(finalScore(snapshot, graded.perQuestion, { o: 3 }, 80)).toEqual({
      percent: 80,
      passed: true,
    });
    expect(finalScore(snapshot, graded.perQuestion, { o: 2 }, 80)).toEqual({
      percent: 70,
      passed: false,
    });
  });

  it("rounds to one decimal but compares the exact value", () => {
    const one: Question[] = [
      snapshot[0],
      { ...snapshot[0], id: "t" },
      { ...snapshot[0], id: "u" },
    ];
    const graded = autoGrade(one, { s: ["a"], t: ["a"], u: ["b"] });
    expect(finalScore(one, graded.perQuestion, {}, 67)).toEqual({
      percent: 66.7,
      passed: false,
    });
  });
});
