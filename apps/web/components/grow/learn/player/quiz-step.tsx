"use client"

import { useEffect, useState } from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  HourglassIcon,
  ListChecksIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import {
  growApi,
  type Attempt,
  type CourseOverview,
  type OutlineStep,
  type QuizAnswers,
} from "@/lib/grow-api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { PlayerBar } from "@/components/grow/learn/player/player-bar"
import {
  isAnswered,
  QuizQuestions,
} from "@/components/grow/learn/player/quiz-questions"

/** Answers survive a refresh in this tab (best effort: storage may be unavailable). */
const draftKey = (attemptId: string) => `grow-quiz:${attemptId}`
function readDraft(attemptId: string): QuizAnswers {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(attemptId)) ?? "{}")
  } catch {
    return {}
  }
}
function writeDraft(attemptId: string, answers: QuizAnswers | null) {
  try {
    if (answers)
      sessionStorage.setItem(draftKey(attemptId), JSON.stringify(answers))
    else sessionStorage.removeItem(draftKey(attemptId))
  } catch {
    /* storage unavailable: answers stay in memory only */
  }
}

/** A quiz in the player: its rules and my record, then the questions on one page, then the result. */
export function QuizStep({
  course,
  step,
  previous,
  next,
  preview,
  go,
  onCourse,
  onFinished,
  attempt,
  setAttempt,
}: {
  course: CourseOverview
  step: OutlineStep
  previous?: OutlineStep
  next?: OutlineStep
  preview: boolean
  go: (stepId: string) => void
  onCourse: (course: CourseOverview) => void
  onFinished: () => void
  /** Held by the player so a layout change (crossing the mobile breakpoint) keeps it. */
  attempt: Attempt | null
  setAttempt: (attempt: Attempt) => void
}) {
  const t = useTranslations("grow.quizStep")
  const quiz = step.quiz!
  const [answers, setAnswers] = useState<QuizAnswers>(() =>
    attempt?.status === "IN_PROGRESS" ? readDraft(attempt.id) : {}
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Set when this pass completed the course: Continue then shows the completion panel.
  const [courseDone, setCourseDone] = useState(false)
  const taking = attempt?.status === "IN_PROGRESS"

  // Leaving with answers not submitted asks first.
  useEffect(() => {
    if (!taking || Object.keys(answers).length === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [taking, answers])

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const a = await growApi.startAttempt(course.id, step.id)
      setAttempt(a)
      setAnswers(readDraft(a.id))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const showLast = async (attemptId: string) => {
    setBusy(true)
    setError(null)
    try {
      setAttempt(await growApi.getAttempt(attemptId))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const answer = (questionId: string, value: string[] | string) => {
    if (!attempt) return
    const nextAnswers = { ...answers, [questionId]: value }
    setAnswers(nextAnswers)
    writeDraft(attempt.id, nextAnswers)
  }

  const submit = async () => {
    if (!attempt) return
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      const sent = Object.fromEntries(
        Object.entries(answers).filter(([, v]) => isAnswered(v))
      )
      const result = await growApi.submitAttempt(attempt.id, sent)
      writeDraft(attempt.id, null)
      setAttempt(result)
      const fresh = await growApi.getCourse(course.id)
      setCourseDone(course.state !== "COMPLETED" && fresh.state === "COMPLETED")
      onCourse(fresh)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const unanswered = attempt
    ? attempt.questions
        .map((q, i) => (isAnswered(answers[q.id]) ? null : i + 1))
        .filter((n): n is number => n !== null)
    : []

  const back = (
    <Button
      variant="ghost"
      disabled={!previous}
      onClick={() => previous && go(previous.id)}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      <span className="max-sm:sr-only">{t("previous")}</span>
    </Button>
  )
  const forward = (label = t("next")) =>
    next ? (
      <Button
        onClick={() => (courseDone ? onFinished() : go(next.id))}
        disabled={!step.completed && next.locked && !courseDone}
      >
        {label}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    ) : courseDone ? (
      <Button onClick={onFinished}>
        {label}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    ) : null

  if (attempt && taking)
    return (
      <>
        <article className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {step.title}
          </h1>
          <QuizQuestions
            attempt={attempt}
            answers={answers}
            onAnswer={answer}
          />
        </article>
        <PlayerBar>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("answered", {
              answered: attempt.questions.length - unanswered.length,
              total: attempt.questions.length,
            })}
          </span>
          <div className="ml-auto flex flex-col items-end gap-1">
            <Button
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                unanswered.length ? setConfirming(true) : void submit()
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? t("submitting") : t("submitAnswers")}
            </Button>
            {error && <FieldError>{error}</FieldError>}
          </div>
        </PlayerBar>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("unansweredTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("unansweredDescription", {
                  count: unanswered.length,
                  questions: unanswered.join(", "),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("keepAnswering")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void submit()}>
                {t("submit")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )

  if (attempt)
    return (
      <>
        <article className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {step.title}
          </h1>
          <div aria-live="polite">
            <ResultAlert attempt={attempt} />
          </div>
          <QuizQuestions
            attempt={attempt}
            answers={submittedAnswers(attempt)}
          />
        </article>
        <PlayerBar>
          {back}
          <div className="ml-auto flex items-center gap-2">
            {attempt.passed === false && (
              <Button
                variant={next ? "outline" : "default"}
                disabled={busy}
                aria-busy={busy}
                onClick={() => void start()}
              >
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RotateCcwIcon data-icon="inline-start" />
                )}
                {busy ? t("starting") : t("tryAgain")}
              </Button>
            )}
            {forward(attempt.passed ? t("continue") : t("next"))}
          </div>
        </PlayerBar>
      </>
    )

  return (
    <>
      <article className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {step.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("quizSummary", {
              count: quiz.questionCount,
              score: quiz.passScore,
              optional: !step.required ? ` · ${t("optional")}` : "",
            })}
          </p>
        </header>
        <div className="flex items-start gap-3 rounded-xl border p-4">
          <ListChecksIcon
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="flex flex-col gap-1 text-sm">
            {quiz.attempts > 0 ? (
              <p className="flex flex-wrap items-center gap-2 tabular-nums">
                {t("bestScore", {
                  score: quiz.best ?? 0,
                  count: quiz.attempts,
                })}
                {step.completed && (
                  <StatusBadge tone="success" icon={CircleCheckIcon}>
                    {t("passed")}
                  </StatusBadge>
                )}
              </p>
            ) : (
              <p>{t("allQuestions")}</p>
            )}
            {quiz.showCorrectAnswers && !step.completed && (
              <p className="text-muted-foreground">{t("answersAfterPass")}</p>
            )}
          </div>
        </div>
        {quiz.pendingReview && (
          <Alert variant="warning">
            <HourglassIcon />
            <AlertTitle>{t("waitingForReview")}</AlertTitle>
            <AlertDescription>{t("reviewNotice")}</AlertDescription>
          </Alert>
        )}
        {preview && (
          <p className="text-sm text-muted-foreground">{t("previewNotice")}</p>
        )}
      </article>
      <PlayerBar>
        {back}
        <div className="ml-auto flex min-w-0 flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {quiz.lastAttemptId && !quiz.inProgress && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void showLast(quiz.lastAttemptId!)}
              >
                {t("seeLastResult")}
              </Button>
            )}
            {step.completed && forward()}
            {!preview && !quiz.pendingReview && (
              <Button
                variant={step.completed ? "outline" : "default"}
                disabled={busy}
                aria-busy={busy}
                onClick={() => void start()}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {busy
                  ? t("starting")
                  : quiz.inProgress
                    ? t("resumeAttempt")
                    : step.completed
                      ? t("takeAgain")
                      : t("startQuiz")}
              </Button>
            )}
            {(preview || quiz.pendingReview) && !step.completed && forward()}
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      </PlayerBar>
    </>
  )
}

function submittedAnswers(attempt: Attempt): QuizAnswers {
  return Object.fromEntries(
    attempt.questions.flatMap((q) =>
      q.answer === null ? [] : [[q.id, q.answer]]
    )
  )
}

function ResultAlert({ attempt }: { attempt: Attempt }) {
  const t = useTranslations("grow.quizStep")
  if (attempt.status === "PENDING_REVIEW")
    return (
      <Alert variant="warning">
        <HourglassIcon />
        <AlertTitle>{t("submitted")}</AlertTitle>
        <AlertDescription>{t("reviewNotice")}</AlertDescription>
      </Alert>
    )
  return attempt.passed ? (
    <Alert variant="success">
      <CircleCheckIcon />
      <AlertTitle>{t("passedScore", { score: attempt.score ?? 0 })}</AlertTitle>
      <AlertDescription>
        {attempt.questions.some((q) => q.correctOptions)
          ? t("rightAnswersMarked")
          : t("stepComplete")}
      </AlertDescription>
    </Alert>
  ) : (
    <Alert variant="danger">
      <CircleXIcon />
      <AlertTitle>
        {t("notPassedScore", {
          score: attempt.score ?? 0,
          needed: attempt.passScore,
        })}
      </AlertTitle>
      <AlertDescription>{t("checkIncorrect")}</AlertDescription>
    </Alert>
  )
}
