import { draw, seeded } from "./draw";
import type { Question, QuizContent } from "./quiz-content";

const choice = (id: string): Question => ({
  id,
  type: "single",
  prompt: id,
  points: 1,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
  correct: ["a"],
});
const quiz = (patch: Partial<QuizContent> = {}): QuizContent => ({
  passScore: 80,
  bankSize: null,
  shuffle: false,
  showCorrectAnswers: false,
  questions: ["q1", "q2", "q3", "q4", "q5"].map(choice),
  ...patch,
});
const ids = (qs: Question[]) => qs.map((q) => q.id);

describe("draw", () => {
  it("presents every question in order when there is no bank and no shuffle", () => {
    expect(ids(draw(quiz(), seeded(1)))).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
    ]);
  });

  it("draws bankSize questions, kept in the author's order without shuffle", () => {
    const drawn = ids(draw(quiz({ bankSize: 3 }), seeded(7)));
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    expect([...drawn].sort()).toEqual(drawn);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const q = quiz({ bankSize: 3, shuffle: true });
    expect(ids(draw(q, seeded(42)))).toEqual(ids(draw(q, seeded(42))));
    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ids(draw(q, seeded(s))).join()),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("shuffles options too, keeping the same options and answer key", () => {
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
        const [first] = draw(quiz({ shuffle: true }), seeded(s));
        if (first.type === "open") throw new Error("unexpected");
        expect([...first.options.map((o) => o.id)].sort()).toEqual([
          "a",
          "b",
          "c",
        ]);
        expect(first.correct).toEqual(["a"]);
        return first.options.map((o) => o.id).join();
      }),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("a bank larger than the quiz draws everything", () => {
    expect(draw(quiz({ bankSize: 50 }), seeded(3))).toHaveLength(5);
  });
});
