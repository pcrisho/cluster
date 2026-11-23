import { BadRequestException } from "@nestjs/common";

export type ChoiceQuestion = {
  id: string;
  type: "single" | "multiple";
  prompt: string;
  points: number;
  options: { id: string; text: string }[];
  correct: string[];
};
/** `guidance` is for the grader only. */
export type OpenQuestion = {
  id: string;
  type: "open";
  prompt: string;
  points: number;
  guidance?: string;
};
export type Question = ChoiceQuestion | OpenQuestion;

export interface QuizContent {
  /** Percent (0–100) of the points of the presented questions needed to pass. */
  passScore: number;
  /** How many questions each attempt draws; null = all of them. */
  bankSize: number | null;
  /** Shuffle questions and options. */
  shuffle: boolean;
  /** Show the right answers once the learner has passed. */
  showCorrectAnswers: boolean;
  questions: Question[];
}

export const EMPTY_QUIZ: QuizContent = {
  passScore: 80,
  bankSize: null,
  shuffle: false,
  showCorrectAnswers: false,
  questions: [],
};

const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 10;
const MAX_PROMPT = 2000;
const MAX_OPTION = 500;
const ID = /^[\w-]{1,64}$/;

const fail = (message: string): never => {
  throw new BadRequestException(message);
};
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const text = (v: unknown, max: number, what: string): string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : fail(`${what} must be between 1 and ${max} characters`);

/** Validates a quiz at the boundary and returns it without unknown fields. Throws 400 naming the question. */
export function parseQuizContent(input: unknown): QuizContent {
  const q = (input ?? {}) as Record<string, unknown>;
  if (!isInt(q.passScore, 0, 100))
    fail("Pass score must be a whole number from 0 to 100");
  if (q.bankSize !== null && !isInt(q.bankSize, 1, MAX_QUESTIONS))
    fail("Bank size must be empty or a positive number");
  if (
    typeof q.shuffle !== "boolean" ||
    typeof q.showCorrectAnswers !== "boolean"
  ) {
    fail("shuffle and showCorrectAnswers must be true or false");
  }
  if (!Array.isArray(q.questions) || q.questions.length > MAX_QUESTIONS) {
    fail(`A quiz holds at most ${MAX_QUESTIONS} questions`);
  }
  const ids = new Set<string>();
  const questions = (q.questions as Record<string, unknown>[]).map(
    (raw, i): Question => {
      const n = `Question ${i + 1}`;
      if (typeof raw?.id !== "string" || !ID.test(raw.id) || ids.has(raw.id))
        fail(`${n} needs a unique id`);
      ids.add(raw.id as string);
      const base = {
        id: raw.id as string,
        prompt: text(raw.prompt, MAX_PROMPT, `${n}: the prompt`),
        points: isInt(raw.points, 1, 100)
          ? raw.points
          : fail(`${n}: points must be a whole number from 1 to 100`),
      };
      if (raw.type === "open") {
        if (
          raw.guidance === undefined ||
          raw.guidance === null ||
          raw.guidance === ""
        )
          return { ...base, type: "open" };
        return {
          ...base,
          type: "open",
          guidance: text(raw.guidance, MAX_PROMPT, `${n}: the guidance`),
        };
      }
      if (raw.type !== "single" && raw.type !== "multiple")
        fail(`${n}: type must be single, multiple or open`);
      if (
        !Array.isArray(raw.options) ||
        raw.options.length < 2 ||
        raw.options.length > MAX_OPTIONS
      ) {
        fail(`${n} needs between 2 and ${MAX_OPTIONS} options`);
      }
      const optionIds = new Set<string>();
      const options = (raw.options as Record<string, unknown>[]).map((o, j) => {
        if (typeof o?.id !== "string" || !ID.test(o.id) || optionIds.has(o.id))
          fail(`${n}: option ${j + 1} needs a unique id`);
        optionIds.add(o.id as string);
        return {
          id: o.id as string,
          text: text(o.text, MAX_OPTION, `${n}: option ${j + 1}`),
        };
      });
      const correct = Array.isArray(raw.correct)
        ? [...new Set(raw.correct as unknown[])]
        : [];
      if (
        correct.length === 0 ||
        correct.some((c) => typeof c !== "string" || !optionIds.has(c))
      ) {
        fail(`${n}: mark at least one of its options as correct`);
      }
      if (raw.type === "single" && correct.length !== 1)
        fail(`${n}: a single-choice question has exactly one correct option`);
      return {
        ...base,
        type: raw.type as "single" | "multiple",
        options,
        correct: correct as string[],
      };
    },
  );
  return {
    passScore: q.passScore as number,
    bankSize: q.bankSize as number | null,
    shuffle: q.shuffle as boolean,
    showCorrectAnswers: q.showCorrectAnswers as boolean,
    questions,
  };
}
