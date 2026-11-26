"use client"

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import type { QuizQuestion } from "@/lib/grow-api"
import { trueFalse, type QuizProblem, withType } from "@/lib/quiz-draft"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const MAX_OPTIONS = 10
const QUESTION_TYPES: QuizQuestion["type"][] = ["single", "multiple", "open"]

/** One question of the quiz builder: type, prompt, points, options with the right ones marked, or grader guidance. */
export function QuizQuestionCard({
  question: q,
  index,
  total,
  problems,
  onChange,
  onDuplicate,
  onMove,
  onDelete,
}: {
  question: QuizQuestion
  index: number
  total: number
  problems: QuizProblem[]
  onChange: (q: QuizQuestion) => void
  onDuplicate: () => void
  onMove: (by: -1 | 1) => void
  onDelete: () => void
}) {
  const t = useTranslations("grow.quizQuestion")
  const tBuilder = useTranslations("grow.quizBuilder")
  const n = index + 1
  const errorId = `q-${q.id}-errors`
  const setOption = (optionId: string, text: string) =>
    q.type !== "open" &&
    onChange({
      ...q,
      options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)),
    })
  const toggleCorrect = (optionId: string, on: boolean) =>
    q.type === "multiple" &&
    onChange({
      ...q,
      correct: on
        ? [...q.correct, optionId]
        : q.correct.filter((c) => c !== optionId),
    })
  const problemText = (problem: QuizProblem) => {
    if (problem.code === "bankTooLarge")
      return tBuilder("bankTooLarge", {
        bankSize: problem.bankSize,
        questionCount: problem.questionCount,
      })
    switch (problem.code) {
      case "promptRequired":
        return tBuilder("promptRequired")
      case "optionTextRequired":
        return tBuilder("optionTextRequired")
      case "correctOptionRequired":
        return tBuilder("correctOptionRequired")
      case "correctOptionsRequired":
        return tBuilder("correctOptionsRequired")
    }
  }

  return (
    <section
      aria-labelledby={`q-${q.id}-title`}
      aria-describedby={problems.length ? errorId : undefined}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`q-${q.id}-title`} className="text-sm font-semibold">
          {t("questionNumber", { number: n })}
        </h3>
        <Select
          value={q.type}
          onValueChange={(type) =>
            onChange(withType(q, type as QuizQuestion["type"]))
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t("typeOfQuestion", { number: n })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`type.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("points")}
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) => {
                const points = Number(e.target.value)
                if (Number.isInteger(points) && points >= 1 && points <= 100)
                  onChange({ ...q, points })
              }}
              className="h-8 w-16"
              aria-label={t("pointsForQuestion", { number: n })}
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("actionsForQuestion", { number: n })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopyIcon />
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === 0}
                onSelect={() => onMove(-1)}
              >
                <ArrowUpIcon />
                {t("moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === total - 1}
                onSelect={() => onMove(1)}
              >
                <ArrowDownIcon />
                {t("moveDown")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor={`q-${q.id}-prompt`} className="sr-only">
          {t("questionNumber", { number: n })}
        </FieldLabel>
        <Textarea
          id={`q-${q.id}-prompt`}
          value={q.prompt}
          maxLength={2000}
          rows={2}
          placeholder={t("promptPlaceholder")}
          onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        />
      </Field>

      {q.type === "open" ? (
        <Field>
          <FieldLabel htmlFor={`q-${q.id}-guidance`}>
            {t("guidance")}
          </FieldLabel>
          <Textarea
            id={`q-${q.id}-guidance`}
            value={q.guidance ?? ""}
            maxLength={2000}
            rows={2}
            placeholder={t("guidancePlaceholder")}
            onChange={(e) => onChange({ ...q, guidance: e.target.value })}
          />
        </Field>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">
            {q.type === "single" ? t("singleOptions") : t("multipleOptions")}
          </legend>
          <RadioGroup
            value={q.type === "single" ? (q.correct[0] ?? "") : ""}
            onValueChange={(value) =>
              q.type === "single" && onChange({ ...q, correct: [value] })
            }
            className="gap-2"
          >
            {q.options.map((o, j) => (
              <div key={o.id} className="flex items-center gap-2">
                {q.type === "single" ? (
                  <RadioGroupItem
                    value={o.id}
                    aria-label={t("optionIsCorrect", { number: j + 1 })}
                  />
                ) : (
                  <Checkbox
                    checked={q.correct.includes(o.id)}
                    onCheckedChange={(on) => toggleCorrect(o.id, on === true)}
                    aria-label={t("optionIsCorrect", { number: j + 1 })}
                  />
                )}
                <Input
                  value={o.text}
                  maxLength={500}
                  placeholder={t("optionNumber", { number: j + 1 })}
                  aria-label={t("optionOfQuestion", {
                    option: j + 1,
                    question: n,
                  })}
                  onChange={(e) => setOption(o.id, e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={q.options.length <= 2}
                  aria-label={t("removeOption", { number: j + 1 })}
                  onClick={() =>
                    onChange({
                      ...q,
                      options: q.options.filter((x) => x.id !== o.id),
                      correct: q.correct.filter((c) => c !== o.id),
                    })
                  }
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </RadioGroup>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={q.options.length >= MAX_OPTIONS}
              onClick={() =>
                onChange({
                  ...q,
                  options: [
                    ...q.options,
                    { id: crypto.randomUUID(), text: "" },
                  ],
                })
              }
            >
              <PlusIcon data-icon="inline-start" />
              {t("addOption")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange(trueFalse(q, { true: t("true"), false: t("false") }))
              }
            >
              {t("trueFalse")}
            </Button>
          </div>
        </fieldset>
      )}

      {problems.length > 0 && (
        <FieldError id={errorId}>
          {problems.map(problemText).join(" ")}
        </FieldError>
      )}
    </section>
  )
}
