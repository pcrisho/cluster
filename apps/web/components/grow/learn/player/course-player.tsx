"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleCheckIcon,
  EyeIcon,
  LockIcon,
  PanelLeftIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { blockerOf, flatSteps, stepHref } from "@/lib/course-outline"
import {
  growApi,
  type Attempt,
  type CourseOverview,
  type LearnerStep,
  type LessonContent,
} from "@/lib/grow-api"
import { durationText } from "@/lib/learner-status"
import { useIsBelow } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  CourseLoadError,
  CourseNotFound,
} from "@/components/grow/learn/course-not-found"
import {
  LessonView,
  READY_HINT,
} from "@/components/grow/learn/player/lesson-view"
import { CertificateActions } from "@/components/grow/learn/certificate-actions"
import { PlayerBar } from "@/components/grow/learn/player/player-bar"
import { PlayerOutline } from "@/components/grow/learn/player/player-outline"
import { QuizStep } from "@/components/grow/learn/player/quiz-step"
import { useCourseOverview } from "@/components/grow/learn/use-course-overview"

type StepLoad =
  | { kind: "loading" }
  | { kind: "ready"; data: LearnerStep }
  | { kind: "locked"; blockerId: string }
  | { kind: "error"; message: string }

/** A course's player: outline beside the step, one primary action in a sticky bar, ←/→ between steps. */
export function CoursePlayer({
  courseId,
  stepId,
  preview,
}: {
  courseId: string
  stepId: string
  preview: boolean
}) {
  const t = useTranslations("grow.coursePlayer")
  const router = useRouter()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const { course, setCourse, error, notFound, reload } = useCourseOverview(
    courseId,
    preview
  )
  const [load, setLoad] = useState<StepLoad>({ kind: "loading" })
  // The step the course was finished on; moving to another step leaves the completion panel.
  const [finishedOn, setFinishedOn] = useState<string | null>(null)
  // Quiz attempts by step, kept here so a layout change does not lose a result on screen.
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({})

  useEffect(() => {
    setBreadcrumb([
      { label: "GROW", href: "/grow" },
      {
        label: course?.title ?? "Course",
        href: `/grow/courses/${courseId}${preview ? "?preview=1" : ""}`,
      },
      { label: t("learn") },
    ])
  }, [setBreadcrumb, course?.title, courseId, preview, t])

  const loadStep = useCallback(async () => {
    setLoad({ kind: "loading" })
    try {
      const data = await growApi.getStep(courseId, stepId, preview)
      setLoad({ kind: "ready", data })
      // Opening a step enrols; the outline catches up with that.
      if (!preview) void reload()
    } catch (err) {
      if (err instanceof ApiError && err.code === "STEP_LOCKED")
        setLoad({
          kind: "locked",
          blockerId: (err.details as { stepId: string }).stepId,
        })
      else if (err instanceof ApiError && err.status === 404)
        // The step was deleted (or never existed): go back to the course.
        router.replace(
          `/grow/courses/${courseId}${preview ? "?preview=1" : ""}`
        )
      else setLoad({ kind: "error", message: getErrorMessage(err) })
    }
  }, [courseId, stepId, preview, reload, router])

  // The outline already knows a locked step: show the lock without asking for the step.
  const courseReady = !!course
  const lockedBy = course && !preview ? blockerOf(course, stepId) : null
  const lockedById = lockedBy?.id
  useEffect(() => {
    if (!courseReady || lockedById) return
    Promise.resolve().then(loadStep)
  }, [loadStep, courseReady, lockedById])

  if (notFound) return <CourseNotFound />
  if (error) return <CourseLoadError error={error} onRetry={reload} />
  if (!course) return <PlayerSkeleton />

  // Until the new step arrives, the previous one's result is not shown.
  const current: StepLoad = lockedBy
    ? { kind: "locked", blockerId: lockedBy.id }
    : load.kind === "ready" && load.data.step.id !== stepId
      ? { kind: "loading" }
      : load

  return (
    <PlayerFrame course={course} stepId={stepId} preview={preview}>
      {finishedOn === stepId ? (
        <CompletionPanel course={course} stepId={stepId} />
      ) : (
        <StepArea
          key={stepId}
          course={course}
          stepId={stepId}
          preview={preview}
          load={current}
          onRetry={loadStep}
          onCompleted={(next) => setCourse(next)}
          onFinished={() => setFinishedOn(stepId)}
          attempt={attempts[stepId] ?? null}
          setAttempt={(a) => setAttempts((m) => ({ ...m, [stepId]: a }))}
          reload={reload}
        />
      )}
    </PlayerFrame>
  )
}

function StepArea({
  course,
  stepId,
  preview,
  load,
  onRetry,
  onCompleted,
  onFinished,
  reload,
  attempt,
  setAttempt,
}: {
  course: CourseOverview
  stepId: string
  preview: boolean
  load: StepLoad
  onRetry: () => void
  onCompleted: (course: CourseOverview) => void
  onFinished: () => void
  reload: () => Promise<void>
  attempt: Attempt | null
  setAttempt: (attempt: Attempt) => void
}) {
  const t = useTranslations("grow.coursePlayer")
  const tLesson = useTranslations("grow.lessonView")
  const router = useRouter()
  const steps = flatSteps(course)
  const index = steps.findIndex((s) => s.id === stepId)
  const outlineStep = steps[index]
  const previous = steps[index - 1]
  const next = steps[index + 1]
  const [reached, setReached] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const markReady = useCallback(() => setReached(true), [])

  const go = useCallback(
    (id: string) => router.push(stepHref(course.id, id, preview)),
    [router, course.id, preview]
  )

  const data = load.kind === "ready" ? load.data : null
  const isQuiz = data?.step.type === "QUIZ"
  const completed = !!outlineStep?.completed || !!data?.completed
  const canGoNext = !!next && (!next.locked || preview || completed)

  // ←/→ move between steps, unless the person is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        target.closest("input, textarea, select, [contenteditable=true]")
      )
        return
      if (e.key === "ArrowLeft" && previous) go(previous.id)
      if (e.key === "ArrowRight" && next && canGoNext) go(next.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previous, next, canGoNext, go])

  const complete = async () => {
    if (preview)
      return next
        ? go(next.id)
        : router.push(`/grow/courses/${course.id}?preview=1`)
    setSaving(true)
    setFailure(null)
    // Optimistic: the outline shows the step done at once.
    onCompleted(markDone(course, stepId))
    try {
      const result = await growApi.completeStep(course.id, stepId)
      // The last required step: the completion panel, whether optional steps follow or not.
      if (
        result.enrollment.status === "COMPLETED" &&
        course.state !== "COMPLETED"
      ) {
        await reload()
        return onFinished()
      }
      if (next) {
        await reload()
        return go(next.id)
      }
      // Last step, but required ones are still pending elsewhere.
      const fresh = await growApi.getCourse(course.id)
      onCompleted(fresh)
      const left = fresh.progress.total - fresh.progress.done
      toast(t("requiredStepsLeft", { count: left }))
      if (fresh.nextStepId) go(fresh.nextStepId)
    } catch (err) {
      await reload()
      setFailure(getErrorMessage(err))
      setSaving(false)
    }
  }

  if (load.kind === "loading" || !outlineStep) return <StepSkeleton />
  if (load.kind === "error")
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>{t("loadStepFailed")}</EmptyTitle>
          <EmptyDescription>{load.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            {t("tryAgain")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  if (load.kind === "locked") {
    const blocker = steps.find((s) => s.id === load.blockerId)
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>
            {t("completeStepFirst", {
              step: blocker?.title ?? t("previousStep"),
            })}
          </EmptyTitle>
          <EmptyDescription>{t("courseInOrder")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => go(load.blockerId)}>
            {t("goToStep", { step: blocker?.title ?? t("previousStep") })}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const step = load.data.step
  if (isQuiz)
    return (
      <div className="flex min-h-[calc(100svh-4rem)] flex-col">
        <QuizStep
          course={course}
          step={outlineStep}
          previous={previous}
          next={next}
          preview={preview}
          go={go}
          onCourse={onCompleted}
          onFinished={onFinished}
          attempt={attempt}
          setAttempt={setAttempt}
        />
      </div>
    )
  const kind = (step.content as LessonContent).kind
  const ready = completed || reached || preview
  const isLast = !next
  // A preview records nothing, so it only moves on.
  const primaryLabel =
    completed || preview
      ? isLast
        ? t("backToCourse")
        : t("next")
      : isLast
        ? t("finishCourse")
        : t("markCompleteContinue")
  const hintId = `hint-${step.id}`
  const duration = durationText(step.durationMinutes ?? 0)

  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col">
      <article className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {step.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("lessonMeta", {
              duration: duration ? ` · ${duration}` : "",
              optional: !step.required ? ` · ${t("optional")}` : "",
            })}
          </p>
        </header>
        <LessonView
          content={step.content as LessonContent}
          title={step.title}
          onReady={markReady}
        />
      </article>

      <PlayerBar>
        <Button
          variant="ghost"
          disabled={!previous}
          onClick={() => previous && go(previous.id)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          <span className="max-sm:sr-only">{t("previous")}</span>
        </Button>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button
            disabled={(!ready && !completed) || saving}
            aria-busy={saving}
            aria-describedby={!ready ? hintId : undefined}
            onClick={() =>
              completed
                ? next
                  ? go(next.id)
                  : router.push(
                      `/grow/courses/${course.id}${preview ? "?preview=1" : ""}`
                    )
                : void complete()
            }
          >
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? t("saving") : primaryLabel}
            {!saving && !(completed && isLast) && (
              <ArrowRightIcon data-icon="inline-end" />
            )}
          </Button>
          {!ready && kind && (
            <p id={hintId} className="text-xs text-muted-foreground">
              {tLesson(READY_HINT[kind])}
            </p>
          )}
          {failure && <FieldError>{failure}</FieldError>}
        </div>
      </PlayerBar>
    </div>
  )
}

/** The course with one step marked done (progress counts required steps only). */
function markDone(course: CourseOverview, stepId: string): CourseOverview {
  const step = flatSteps(course).find((s) => s.id === stepId)
  if (!step || step.completed) return course
  return {
    ...course,
    progress: step.required
      ? { ...course.progress, done: course.progress.done + 1 }
      : course.progress,
    sections: course.sections.map((s) => ({
      ...s,
      steps: s.steps.map((x) =>
        x.id === stepId ? { ...x, completed: true } : x
      ),
    })),
  }
}

function CompletionPanel({
  course,
  stepId,
}: {
  course: CourseOverview
  stepId: string
}) {
  const t = useTranslations("grow.coursePlayer")
  const steps = flatSteps(course)
  const next = steps[steps.findIndex((s) => s.id === stepId) + 1]
  return (
    <div
      role="status"
      className="mx-auto flex max-w-[720px] animate-in flex-col items-center gap-4 px-6 py-20 text-center duration-150 fade-in motion-reduce:animate-none"
    >
      <CircleCheckIcon className="size-10 text-success" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("courseCompleted", { course: course.title })}
      </h1>
      {course.certificate ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border p-4">
          <p className="text-sm">
            {t("certificateIssued")} ·{" "}
            <span className="font-mono">{course.certificate.code}</span>
          </p>
          <CertificateActions certificate={course.certificate} />
        </div>
      ) : (
        !course.issuesCertificate && (
          <p className="text-sm text-muted-foreground">{t("noCertificate")}</p>
        )
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/grow">{t("backToLearning")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/grow/courses/${course.id}`}>{t("viewCourse")}</Link>
        </Button>
      </div>
      {next && (
        <Button asChild variant="ghost">
          <Link href={stepHref(course.id, next.id, false)}>
            {t("goOnTo", { step: next.title })}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      )}
    </div>
  )
}

function PlayerFrame({
  course,
  stepId,
  preview,
  children,
}: {
  course: CourseOverview
  stepId: string
  preview: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("grow.coursePlayer")
  // Below 1024 px (a tablet, or a laptop with the app sidebar open) the reading column needs the
  // room: the outline moves to a sheet, as on a phone.
  const compact = useIsBelow(1024)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const percent = course.progress.total
    ? Math.round((course.progress.done / course.progress.total) * 100)
    : 0

  const content = (
    <div className="min-w-0 flex-1">
      <div className="sticky top-16 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {compact && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <PanelLeftIcon data-icon="inline-start" />
                {t("outline")}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("courseOutline")}</SheetTitle>
                <SheetDescription>{t("stepsOfCourse")}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pt-8">
                <PlayerOutline
                  course={course}
                  currentStepId={stepId}
                  preview={preview}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        )}
        {preview ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <EyeIcon className="size-4" aria-hidden />
            {t("previewNotice")}
          </span>
        ) : (
          <div className="ml-auto flex w-40 items-center gap-2 sm:w-56">
            <Progress
              value={percent}
              aria-label={t("courseProgress")}
              aria-valuetext={t("requiredProgress", {
                done: course.progress.done,
                total: course.progress.total,
              })}
            />
            <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {percent}%
            </span>
          </div>
        )}
      </div>
      {children}
    </div>
  )

  if (compact) return <div className="flex flex-1">{content}</div>

  return (
    // Visible overflow: the outline sticks to the viewport, which a scrolling ancestor would break.
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-auto flex-1"
      style={{ overflow: "visible" }}
    >
      <ResizablePanel
        id="outline"
        defaultSize="288px"
        minSize="200px"
        maxSize="480px"
        groupResizeBehavior="preserve-pixel-size"
        style={{ overflow: "visible" }}
      >
        <aside className="sticky top-16 h-[calc(100svh-4rem)]">
          <PlayerOutline
            course={course}
            currentStepId={stepId}
            preview={preview}
          />
        </aside>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="content" style={{ overflow: "visible" }}>
        {content}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function StepSkeleton() {
  return (
    <div
      className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-8"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

function PlayerSkeleton() {
  return (
    <div className="flex flex-1">
      <div className="hidden w-72 shrink-0 flex-col gap-2 border-r p-3 md:flex">
        <Skeleton className="h-7" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
      </div>
      <div className="flex-1">
        <StepSkeleton />
      </div>
    </div>
  )
}
