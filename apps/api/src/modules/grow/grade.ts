import { BadRequestException } from "@nestjs/common";
import type { Question } from "./quiz-content";

/** Option ids for a choice question, text for an open one. */
export type Answers = Record<string, string[] | string>;

/** Per question: right or wrong (null while a reviewer has not graded it) and the points it earned. */
export type PerQuestion = Record<
  string,
  { correct: boolean | null; earned: number | null }
>;

const MAX_OPEN_ANSWER = 5000;

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

/** The learner's answers checked against the questions they were given; anything else is a 400. */
export function parseAnswers(snapshot: Question[], input: unknown): Answers {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    fail("Answers must be an object keyed by question");
  const byId = new Map(snapshot.map((q) => [q.id, q]));
  const out: Answers = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    const q =
      byId.get(id) ?? fail("An answer is for a question not in this attempt");
    if (q.type === "open") {
      if (typeof value !== "string" || value.length > MAX_OPEN_ANSWER)
        fail(`Written answers hold up to ${MAX_OPEN_ANSWER} characters`);
      out[id] = (value as string).trim();
      continue;
    }
    const options = new Set(q.options.map((o) => o.id));
    if (
      !Array.isArray(value) ||
      value.some((v) => typeof v !== "string" || !options.has(v))
    )
      fail("An answer picks an option that is not in its question");
    const picked = [...new Set(value as string[])];
    if (q.type === "single" && picked.length > 1)
      fail("A single-choice question takes one option");
    out[id] = picked;
  }
  return out;
}

/** Choice questions are all-or-nothing; a written answer waits for a reviewer (an empty one earns nothing). */
export function autoGrade(snapshot: Question[], answers: Answers) {
  const perQuestion: PerQuestion = {};
  let openPending = false;
  for (const q of snapshot) {
    const answer = answers[q.id];
    if (q.type === "open") {
      const written = typeof answer === "string" && answer.length > 0;
      openPending ||= written;
      perQuestion[q.id] = written
        ? { correct: null, earned: null }
        : { correct: false, earned: 0 };
      continue;
    }
    const picked = new Set(Array.isArray(answer) ? answer : []);
    const correct =
      picked.size === q.correct.length && q.correct.every((c) => picked.has(c));
    perQuestion[q.id] = { correct, earned: correct ? q.points : 0 };
  }
  return { perQuestion, openPending };
}

/** Percent of the presented points (one decimal) and whether it reaches the pass mark (compared unrounded). */
export function finalScore(
  snapshot: Question[],
  perQuestion: PerQuestion,
  openScores: Record<string, number>,
  passScore: number,
) {
  const total = snapshot.reduce((sum, q) => sum + q.points, 0);
  const earned = snapshot.reduce(
    (sum, q) => sum + (perQuestion[q.id]?.earned ?? openScores[q.id] ?? 0),
    0,
  );
  const exact = total === 0 ? 0 : (earned / total) * 100;
  return { percent: Math.round(exact * 10) / 10, passed: exact >= passScore };
}
