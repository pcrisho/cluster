"use client"

import { useState } from "react"
import { PlusIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { QuizContent, QuizQuestion } from "@/lib/grow-api"
import { newQuestion, quizProblems, quizSummary } from "@/lib/quiz-draft"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { QuizQuestionCard } from "@/components/grow/author/quiz-question-card"

/**
 * A quiz's rules and questions. Edits stay local and save (debounced, by the caller) only while
 * the whole quiz is valid; problems show next to the question they belong to.
 */
export function QuizBuilder({
  initial,
  onSave,
}: {
  initial: QuizContent
  onSave: (quiz: QuizContent) => void
}) {
  const t = useTranslations("grow.quizBuilder")
  const [quiz, setQuiz] = useState(initial)
  const [deleting, setDeleting] = useState<number | null>(null)
  const problems = quizProblems(quiz)
  const invalid = Object.keys(problems).length
  const problemText = (problem: (typeof problems)[string][number]) => {
    if (problem.code === "bankTooLarge")
      return t("bankTooLarge", {
        bankSize: problem.bankSize,
        questionCount: problem.questionCount,
      })
    return t(problem.code)
  }
  const summary = quizSummary(quiz)

  const update = (next: QuizContent) => {
    setQuiz(next)
    if (Object.keys(quizProblems(next)).length === 0) onSave(next)
  }
  const setQuestions = (questions: QuizQuestion[]) =>
    update({ ...quiz, questions })
  const at = (i: number, q: QuizQuestion) =>
    setQuestions(quiz.questions.map((x, j) => (j === i ? q : x)))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="quiz-pass">{t("passScore")}</FieldLabel>
          <div className="flex items-center gap-3">
            <Slider
              min={0}
              max={100}
              step={5}
              value={[quiz.passScore]}
              onValueChange={([passScore]) => update({ ...quiz, passScore })}
              aria-label={t("passScore")}
            />
            <div className="flex items-center gap-1">
              <Input
                id="quiz-pass"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={quiz.passScore}
                onChange={(e) => {
                  const passScore = Number(e.target.value)
                  if (
                    Number.isInteger(passScore) &&
                    passScore >= 0 &&
                    passScore <= 100
                  )
                    update({ ...quiz, passScore })
                }}
                className="h-8 w-16"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="quiz-bank">
            {t("questionsPerAttempt")}
          </FieldLabel>
          <Input
            id="quiz-bank"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            placeholder={t("all")}
            value={quiz.bankSize ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const bankSize = raw === "" ? null : Number(raw)
              if (
                bankSize === null ||
                (Number.isInteger(bankSize) && bankSize >= 1 && bankSize <= 200)
              )
                update({ ...quiz, bankSize })
            }}
            className="h-8 w-24"
          />
        </Field>
        <Field orientation="horizontal">
          <Switch
            id="quiz-shuffle"
            checked={quiz.shuffle}
            onCheckedChange={(shuffle) => update({ ...quiz, shuffle })}
          />
          <FieldLabel htmlFor="quiz-shuffle">{t("shuffle")}</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id="quiz-answers"
            checked={quiz.showCorrectAnswers}
            onCheckedChange={(showCorrectAnswers) =>
              update({ ...quiz, showCorrectAnswers })
            }
          />
          <FieldLabel htmlFor="quiz-answers">{t("showAnswers")}</FieldLabel>
        </Field>
        {problems.quiz && (
          <FieldError className="sm:col-span-2">
            {problemText(problems.quiz[0])}
          </FieldError>
        )}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {t("summaryQuestions", { count: summary.questionCount })} ·{" "}
          {t("summaryPoints", { count: summary.points })}
          {summary.bankSize !== null &&
            ` · ${t("summaryDraw", { count: summary.bankSize })}`}
        </span>
        {invalid > 0 && (
          <span className="flex items-center gap-1.5 text-warning-text">
            <TriangleAlertIcon className="size-4" aria-hidden />
            {t("saveWhenComplete")}
          </span>
        )}
      </div>

      {quiz.questions.map((q, i) => (
        <QuizQuestionCard
          key={q.id}
          question={q}
          index={i}
          total={quiz.questions.length}
          problems={problems[q.id] ?? []}
          onChange={(next) => at(i, next)}
          onDuplicate={() => {
            const copy = structuredClone(q)
            copy.id = crypto.randomUUID()
            const next = [...quiz.questions]
            next.splice(i + 1, 0, copy)
            setQuestions(next)
          }}
          onMove={(by) => {
            const next = [...quiz.questions]
            next.splice(i + by, 0, ...next.splice(i, 1))
            setQuestions(next)
          }}
          onDelete={() => setDeleting(i)}
        />
      ))}

      <Button
        variant="outline"
        disabled={quiz.questions.length >= 200}
        onClick={() => setQuestions([...quiz.questions, newQuestion("single")])}
      >
        <PlusIcon data-icon="inline-start" />
        {t("addQuestion")}
      </Button>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteQuestion", { number: (deleting ?? 0) + 1 })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepQuestion")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting !== null &&
                setQuestions(quiz.questions.filter((_, j) => j !== deleting))
              }
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
