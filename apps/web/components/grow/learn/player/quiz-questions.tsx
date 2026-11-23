"use client"

import { CircleCheckIcon, CircleXIcon, HourglassIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { Attempt, QuizAnswers } from "@/lib/grow-api"
import { questionResult, type QuestionResult } from "@/lib/grow-status"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { StatusBadge } from "@/components/ui/status-badge"
import { Textarea } from "@/components/ui/textarea"

const MAX_WRITTEN = 5000

/** Whether a question has an answer worth sending. */
export function isAnswered(answer: string[] | string | undefined) {
  return Array.isArray(answer) ? answer.length > 0 : !!answer?.trim()
}

/**
 * The questions of an attempt, numbered, one card each. While taking: radio buttons, checkboxes
 * ("Select all that apply") or a text box with a counter. Once submitted (`answers` read-only): the
 * learner's choices, right or wrong, and the right options when the attempt reveals them.
 */
export function QuizQuestions({
  attempt,
  answers,
  onAnswer,
}: {
  attempt: Attempt
  answers: QuizAnswers
  /** Absent once submitted. */
  onAnswer?: (questionId: string, answer: string[] | string) => void
}) {
  const t = useTranslations("grow.quizQuestions")
  const readOnly = !onAnswer
  return (
    <ol className="flex flex-col gap-4">
      {attempt.questions.map((q, i) => {
        const answer = answers[q.id]
        const labelId = `quiz-q-${q.id}`
        const result = q.result
        return (
          <li
            key={q.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p id={labelId} className="font-medium whitespace-pre-wrap">
                  {q.prompt}
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.type === "multiple" && `${t("selectAll")} · `}
                  {t("points", { count: q.points })}
                </p>
              </div>
              {readOnly && result && <ResultMark result={result} />}
            </div>

            {q.type === "open" ? (
              readOnly ? (
                <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                  {typeof answer === "string" && answer
                    ? answer
                    : t("noAnswer")}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <Textarea
                    aria-labelledby={labelId}
                    value={typeof answer === "string" ? answer : ""}
                    maxLength={MAX_WRITTEN}
                    rows={4}
                    onChange={(e) => onAnswer(q.id, e.target.value)}
                  />
                  <p className="text-right text-xs text-muted-foreground tabular-nums">
                    {(typeof answer === "string" ? answer : "").length} /{" "}
                    {MAX_WRITTEN}
                  </p>
                </div>
              )
            ) : q.type === "single" ? (
              <RadioGroup
                aria-labelledby={labelId}
                value={Array.isArray(answer) ? (answer[0] ?? "") : ""}
                onValueChange={(v) => onAnswer?.(q.id, [v])}
                disabled={readOnly}
              >
                {q.options?.map((o) => (
                  <OptionRow
                    key={o.id}
                    id={`${q.id}-${o.id}`}
                    text={o.text}
                    right={q.correctOptions?.includes(o.id)}
                    readOnly={readOnly}
                    picked={Array.isArray(answer) && answer[0] === o.id}
                  >
                    <RadioGroupItem
                      value={o.id}
                      id={`${q.id}-${o.id}`}
                      className={readOnly ? READ_ONLY_CONTROL : undefined}
                    />
                  </OptionRow>
                ))}
              </RadioGroup>
            ) : (
              <div
                role="group"
                aria-labelledby={labelId}
                className="grid gap-2"
              >
                {q.options?.map((o) => {
                  const picked = Array.isArray(answer) && answer.includes(o.id)
                  return (
                    <OptionRow
                      key={o.id}
                      id={`${q.id}-${o.id}`}
                      text={o.text}
                      right={q.correctOptions?.includes(o.id)}
                      readOnly={readOnly}
                      picked={picked}
                    >
                      <Checkbox
                        id={`${q.id}-${o.id}`}
                        checked={picked}
                        disabled={readOnly}
                        className={readOnly ? READ_ONLY_CONTROL : undefined}
                        onCheckedChange={(on) => {
                          const current = Array.isArray(answer) ? answer : []
                          onAnswer?.(
                            q.id,
                            on
                              ? [...current, o.id]
                              : current.filter((x) => x !== o.id)
                          )
                        }}
                      />
                    </OptionRow>
                  )
                })}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// A submitted answer is read, not disabled: the learner's choices keep full contrast.
const READ_ONLY_CONTROL = "disabled:cursor-default disabled:opacity-100"

function OptionRow({
  id,
  text,
  right,
  readOnly,
  picked,
  children,
}: {
  id: string
  text: string
  /** Known only when the attempt reveals the right answers. */
  right?: boolean
  readOnly: boolean
  picked: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("grow.quizQuestions")
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-1.5",
        right && "bg-success-subtle"
      )}
    >
      {children}
      <Label
        htmlFor={id}
        className={cn(
          "flex-1 font-normal",
          readOnly && "peer-disabled:cursor-default peer-disabled:opacity-100",
          readOnly && !picked && "text-muted-foreground"
        )}
      >
        {text}
      </Label>
      {right && (
        <span className="text-xs font-medium text-success-text">
          {t("rightAnswer")}
        </span>
      )}
    </div>
  )
}

const RESULT_ICON = {
  CORRECT: CircleCheckIcon,
  INCORRECT: CircleXIcon,
  PENDING: HourglassIcon,
} as const

function ResultMark({
  result,
}: {
  result: NonNullable<Attempt["questions"][number]["result"]>
}) {
  const t = useTranslations("grow.quizQuestions")
  const kind: QuestionResult =
    result.correct === null
      ? "PENDING"
      : result.correct
        ? "CORRECT"
        : "INCORRECT"
  const { tone } = questionResult(kind)
  return (
    <StatusBadge tone={tone} icon={RESULT_ICON[kind]}>
      {t(kind)}
    </StatusBadge>
  )
}
