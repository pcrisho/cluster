import { randomInt } from "crypto";
import type { Question, QuizContent } from "./quiz-content";

/** A number in [0, 1). */
export type Random = () => number;

/** The server's randomness for real attempts. */
export const secureRandom: Random = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** A repeatable sequence (mulberry32), for tests. */
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The questions of one attempt: `bankSize` of them at random (all when empty), in the author's order
 * unless the quiz shuffles, in which case questions and options are both shuffled.
 */
export function draw(quiz: QuizContent, random: Random): Question[] {
  const count = Math.min(
    quiz.bankSize ?? quiz.questions.length,
    quiz.questions.length,
  );
  const picked = new Set(
    shuffled(quiz.questions, random)
      .slice(0, count)
      .map((q) => q.id),
  );
  const chosen = quiz.questions.filter((q) => picked.has(q.id));
  if (!quiz.shuffle) return chosen;
  return shuffled(chosen, random).map((q) =>
    q.type === "open" ? q : { ...q, options: shuffled(q.options, random) },
  );
}
