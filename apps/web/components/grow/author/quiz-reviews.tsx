"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleXIcon,
  HourglassIcon,
  InboxIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { growApi, type ReviewAttempt } from "@/lib/grow-api"
import { questionResult } from "@/lib/grow-status"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { PageHeader } from "@/components/layout/page"
import {
  CourseLoadError,
  CourseNotFound,
} from "@/components/grow/learn/course-not-found"
import { useDates } from "@/lib/i18n/use-dates"

const learnerName = (a: ReviewAttempt) =>
  `${a.learner.firstName} ${a.learner.lastName}`

/** Quiz attempts with written answers waiting for a grade, oldest first; grading one returns to the queue. */
export function QuizReviews({ courseId }: { courseId: string }) {
  const t = useTranslations("grow.quizReviews")
  const dates = useDates()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [title, setTitle] = useState<string | null>(null)
  const [queue, setQueue] = useState<ReviewAttempt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [open, setOpen] = useState<ReviewAttempt | null>(null)

  useEffect(() => {
    setBreadcrumb([
      { label: "GROW", href: "/grow" },
      { label: t("manage"), href: "/grow/manage" },
      { label: title ?? t("course"), href: `/grow/courses/${courseId}/edit` },
      { label: t("reviews") },
    ])
  }, [setBreadcrumb, title, courseId, t])

  const load = useCallback(async () => {
    try {
      const [list, course] = await Promise.all([
        growApi.listReviews(courseId),
        growApi.getCourse(courseId, true),
      ])
      setQueue(list)
      setTitle(course.title)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && [403, 404].includes(err.status))
        setNotFound(true)
      else setError(getErrorMessage(err))
    }
  }, [courseId])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  if (notFound) return <CourseNotFound />
  if (error) return <CourseLoadError error={error} onRetry={load} />

  if (open)
    return (
      <GradeAttempt
        attempt={open}
        onBack={() => setOpen(null)}
        onGraded={(graded) => {
          setQueue((q) => q?.filter((a) => a.id !== graded.id) ?? null)
          setOpen(null)
          toast.success(
            t("gradedToast", {
              name: learnerName(open),
              score: graded.score === null ? t("noScore") : `${graded.score}%`,
              result: graded.passed ? t("passed") : t("notPassed"),
            })
          )
        }}
      />
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={
          title
            ? t("description", { course: title })
            : t("descriptionWithoutCourse")
        }
      />
      {queue === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {queue.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpen(a)}
                className="flex w-full flex-col gap-1 p-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="font-medium sm:w-56 sm:truncate">
                  {learnerName(a)}
                </span>
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {a.stepTitle}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t("submitted", {
                      date: dates.relative(a.submittedAt),
                    })}
                  </span>
                  <StatusBadge tone="warning" icon={HourglassIcon}>
                    {t("pending")}
                  </StatusBadge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GradeAttempt({
  attempt,
  onBack,
  onGraded,
}: {
  attempt: ReviewAttempt
  onBack: () => void
  onGraded: (graded: ReviewAttempt) => void
}) {
  const t = useTranslations("grow.quizReviews")
  const dates = useDates()
  const pending = attempt.questions.filter(
    (q) => q.type === "open" && q.result?.earned === null
  )
  const [scores, setScores] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = pending.every((q) => {
    const n = Number(scores[q.id])
    return (
      scores[q.id]?.trim() && Number.isInteger(n) && n >= 0 && n <= q.points
    )
  })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      onGraded(
        await growApi.gradeAttempt(
          attempt.id,
          Object.fromEntries(pending.map((q) => [q.id, Number(scores[q.id])]))
        )
      )
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        {t("backToQueue")}
      </Button>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{learnerName(attempt)}</h1>
        <p className="text-sm text-muted-foreground">
          {t("attemptSummary", {
            step: attempt.stepTitle,
            date: dates.relative(attempt.submittedAt),
            score: attempt.passScore,
          })}
        </p>
      </header>
      <ol className="flex w-full flex-col gap-4">
        {attempt.questions.map((q, i) => (
          <li
            key={q.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>
                <p className="text-xs text-muted-foreground">
                  {t("points", { count: q.points })}
                </p>
              </div>
              {q.type !== "open" && q.result && (
                <StatusBadge
                  tone={
                    questionResult(q.result.correct ? "CORRECT" : "INCORRECT")
                      .tone
                  }
                  icon={q.result.correct ? CircleCheckIcon : CircleXIcon}
                >
                  {t(q.result.correct ? "correct" : "incorrect")}
                </StatusBadge>
              )}
              {q.type === "open" && pending.includes(q) && (
                <StatusBadge tone="warning" icon={HourglassIcon}>
                  {t("toGrade")}
                </StatusBadge>
              )}
            </div>
            {q.type === "open" ? (
              <>
                <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                  {typeof q.answer === "string" && q.answer
                    ? q.answer
                    : t("noAnswer")}
                </p>
                {q.guidance && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{t("guidance")} </span>
                    {q.guidance}
                  </p>
                )}
                {pending.includes(q) && (
                  <Field className="w-40">
                    <FieldLabel htmlFor={`score-${q.id}`}>
                      {t("pointsLabel")}
                    </FieldLabel>
                    <Input
                      id={`score-${q.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={q.points}
                      value={scores[q.id] ?? ""}
                      onChange={(e) =>
                        setScores((s) => ({ ...s, [q.id]: e.target.value }))
                      }
                    />
                    <FieldDescription>
                      {t("scoreRange", { points: q.points })}
                    </FieldDescription>
                  </Field>
                )}
              </>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {q.options.map((o) => {
                  const picked =
                    Array.isArray(q.answer) && q.answer.includes(o.id)
                  const right = q.correct.includes(o.id)
                  return (
                    <li key={o.id} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">
                        {picked ? t("chosen") : ""}
                      </span>
                      <span className={right ? "font-medium" : ""}>
                        {o.text}
                      </span>
                      {right && (
                        <span className="text-xs font-medium text-success-text">
                          {t("rightAnswer")}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!valid || saving}
          aria-busy={saving}
          onClick={() => void save()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {saving ? t("saving") : t("saveGrade")}
        </Button>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  )
}
