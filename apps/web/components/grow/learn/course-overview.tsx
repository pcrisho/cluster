"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  EyeIcon,
  LockIcon,
  PencilIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { flatSteps, stepHref, stepMeta } from "@/lib/course-outline"
import {
  growApi,
  type CourseOverview as Overview,
  type OutlineStep,
} from "@/lib/grow-api"
import { durationText } from "@/lib/learner-status"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { CourseStatusBadge } from "@/components/grow/course-status-badge"
import { CertificateActions } from "@/components/grow/learn/certificate-actions"
import {
  CourseLoadError,
  CourseNotFound,
} from "@/components/grow/learn/course-not-found"
import {
  LearnerStatusBadge,
  NewBadge,
} from "@/components/grow/learn/learner-status-badge"
import { useCourseOverview } from "@/components/grow/learn/use-course-overview"
import { useDates } from "@/lib/i18n/use-dates"

/** A course's page for learners: what it holds, where they are and one action to go on. Reading it records nothing. */
export function CourseOverview({
  courseId,
  preview,
}: {
  courseId: string
  preview: boolean
}) {
  const t = useTranslations("grow.courseOverview")
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const { course, error, notFound, reload } = useCourseOverview(
    courseId,
    preview
  )

  useEffect(() => {
    setBreadcrumb([
      { label: "GROW", href: "/grow" },
      { label: course?.title ?? t("course") },
    ])
  }, [setBreadcrumb, course?.title, t])

  if (notFound) return <CourseNotFound />
  if (error) return <CourseLoadError error={error} onRetry={reload} />
  if (!course) return <OverviewSkeleton />

  const steps = flatSteps(course)
  const archived = course.status === "ARCHIVED" && !preview
  const percent = course.progress.total
    ? Math.round((course.progress.done / course.progress.total) * 100)
    : 0
  const duration = durationText(
    steps.reduce((sum, step) => sum + (step.durationMinutes ?? 0), 0)
  )
  const contentSummary = t("stepCount", { count: steps.length })
  const courseSummary = [
    t("sectionCount", { count: course.sections.length }),
    duration
      ? t("stepsAndDuration", {
          steps: contentSummary,
          duration,
        })
      : contentSummary,
  ].join(" · ")
  const hasStatusPanel =
    (!preview &&
      (!!course.enrollment || course.mandatory || !!course.certificate)) ||
    (!archived && steps.length > 0)

  return (
    <div className="flex flex-col gap-6">
      {preview && (
        <Alert variant="info">
          <EyeIcon />
          <AlertTitle>{t("previewTitle")}</AlertTitle>
          <AlertDescription>{t("previewDescription")}</AlertDescription>
        </Alert>
      )}
      {archived && (
        <Alert>
          <ArchiveIcon />
          <AlertTitle>{t("archivedTitle")}</AlertTitle>
          <AlertDescription>{t("archivedDescription")}</AlertDescription>
        </Alert>
      )}

      <header className="flex flex-col gap-4">
        <div className="flex min-w-0 gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <EntityGlyph
              iconType={course.iconType}
              icon={course.icon}
              emoji={course.emoji}
              fallback="graduation"
              size="lg"
            />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {course.title}
              </h1>
              {course.isNew && <NewBadge />}
              {course.status !== "PUBLISHED" && (
                <CourseStatusBadge status={course.status} />
              )}
            </div>
            {course.description && (
              <CourseDescription description={course.description} />
            )}
            {steps.length > 0 && (
              <p className="text-xs text-muted-foreground">{courseSummary}</p>
            )}
            {course.canManage && (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link href={`/grow/courses/${course.id}/edit`}>
                  <PencilIcon data-icon="inline-start" />
                  {t("editCourse")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        {hasStatusPanel && (
          <CourseStatusPanel
            course={course}
            preview={preview}
            archived={archived}
            percent={percent}
            hasSteps={steps.length > 0}
            className="xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1"
          />
        )}
        <section
          aria-labelledby="content-heading"
          className={cn(
            "flex flex-col gap-3",
            hasStatusPanel ? "xl:col-start-1 xl:row-start-1" : "xl:col-span-2"
          )}
        >
          <div className="border-b pb-2">
            <h2 id="content-heading" className="text-base font-semibold">
              {t("contentTitle")}
            </h2>
          </div>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSteps")}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {course.sections.map((section, index) => (
                <li key={section.id}>
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                      <span className="flex-1">
                        {index + 1}. {section.title}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {section.steps.filter((s) => s.completed).length} /{" "}
                        {section.steps.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mt-1 flex flex-col gap-0.5 pl-6">
                        {section.steps.map((step) => (
                          <StepRow
                            key={step.id}
                            courseId={course.id}
                            step={step}
                            current={
                              !!course.enrollment &&
                              course.nextStepId === step.id
                            }
                            linked={!archived}
                            preview={preview}
                          />
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function CourseDescription({ description }: { description: string }) {
  const t = useTranslations("grow.courseOverview")
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)

  useEffect(() => {
    const paragraph = paragraphRef.current
    if (!paragraph) return

    const measure = () => {
      if (!paragraph.clientWidth) return

      const measurement = paragraph.cloneNode(true) as HTMLParagraphElement
      measurement.classList.remove("line-clamp-4")
      measurement.removeAttribute("id")
      Object.assign(measurement.style, {
        position: "absolute",
        visibility: "hidden",
        width: `${paragraph.clientWidth}px`,
        height: "auto",
        maxHeight: "none",
        overflow: "visible",
        left: "-10000px",
        top: "0",
      })
      document.body.appendChild(measurement)

      const lineHeight = Number.parseFloat(
        window.getComputedStyle(measurement).lineHeight
      )
      const fullHeight = measurement.getBoundingClientRect().height
      measurement.remove()
      setCanExpand(
        Number.isFinite(lineHeight) && fullHeight > lineHeight * 4 + 1
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paragraph)
    return () => observer.disconnect()
  }, [description])

  return (
    <div className="flex w-full max-w-prose flex-col items-start gap-1">
      <p
        id="course-description"
        ref={paragraphRef}
        className={cn(
          "w-full text-sm text-muted-foreground",
          !expanded && "line-clamp-4"
        )}
      >
        {description}
      </p>
      {canExpand && (
        <Button
          variant="link"
          size="sm"
          className="min-h-10 w-fit"
          aria-controls="course-description"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t("showLess") : t("showMore")}
        </Button>
      )}
    </div>
  )
}

/**
 * The learner's side of the course, the same order in every state: status, progress, the one
 * action, then the certificate once there is one.
 */
function CourseStatusPanel({
  course,
  preview,
  archived,
  percent,
  hasSteps,
  className,
}: {
  course: Overview
  preview: boolean
  archived: boolean
  percent: number
  hasSteps: boolean
  className?: string
}) {
  const t = useTranslations("grow.courseOverview")
  const tStatus = useTranslations("grow.learnerStatus")
  const dates = useDates()
  const completedAt =
    course.state === "COMPLETED" ? course.enrollment?.completedAt : null
  const showStatus =
    !preview && (!!completedAt || course.mandatory || !!course.enrollment)
  return (
    <aside
      aria-label={t("yourProgress")}
      className={cn(
        "flex w-full flex-col gap-4 rounded-xl border bg-card p-4",
        className
      )}
    >
      {showStatus && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {completedAt ? (
            <StatusBadge tone="success" icon={CircleCheckIcon}>
              {t("completed")}
            </StatusBadge>
          ) : (
            <LearnerStatusBadge state={course.state} dueAt={course.dueAt} />
          )}
          <span className="text-xs text-muted-foreground">
            {completedAt
              ? dates.instant(completedAt)
              : course.dueAt &&
                tStatus("dueDate", {
                  date: dates.calendar(course.dueAt, "monthDay"),
                })}
          </span>
        </div>
      )}
      {course.enrollment && !preview && (
        <div className="flex flex-col gap-1.5">
          <Progress
            value={percent}
            aria-label={t("courseProgress")}
            aria-valuetext={t("progressAria", {
              done: course.progress.done,
              total: course.progress.total,
            })}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("progressSummary", {
              done: course.progress.done,
              total: course.progress.total,
              percent,
            })}
          </p>
        </div>
      )}
      {!archived && hasSteps && (
        <PrimaryAction course={course} preview={preview} />
      )}
      {course.certificate && !preview && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{t("certificate")}</span>
            <span className="text-xs text-muted-foreground">
              {t("issuedOn", {
                date: dates.calendar(course.certificate.issuedOn),
              })}
            </span>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {course.certificate.code}
          </p>
          <CertificateActions certificate={course.certificate} />
        </div>
      )}
    </aside>
  )
}

function PrimaryAction({
  course,
  preview,
}: {
  course: Overview
  preview: boolean
}) {
  const t = useTranslations("grow.courseOverview")
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const steps = flatSteps(course)
  const first = steps[0]

  if (preview)
    return (
      <Button asChild>
        <Link href={stepHref(course.id, first.id, true)}>
          {t("previewCourse")}
        </Link>
      </Button>
    )
  if (course.state === "COMPLETED")
    return (
      <Button asChild variant="outline">
        <Link href={stepHref(course.id, first.id, false)}>
          {t("reviewCourse")}
        </Link>
      </Button>
    )
  if (course.enrollment) {
    const next = course.nextStepId ?? first.id
    const index = steps.findIndex((s) => s.id === next)
    return (
      <Button asChild>
        <Link href={stepHref(course.id, next, false)}>
          {t("continueStep", {
            step: index + 1,
            total: steps.length,
          })}
        </Link>
      </Button>
    )
  }

  const start = async () => {
    setStarting(true)
    try {
      await growApi.enroll(course.id)
      router.push(stepHref(course.id, first.id, false))
    } catch (err) {
      toast.error(getErrorMessage(err))
      setStarting(false)
    }
  }
  return (
    <Button
      onClick={() => void start()}
      disabled={starting}
      aria-busy={starting}
    >
      {starting && <Spinner data-icon="inline-start" />}
      {starting ? t("starting") : t("startCourse")}
    </Button>
  )
}

function StepRow({
  courseId,
  step,
  current,
  linked,
  preview,
}: {
  courseId: string
  step: OutlineStep
  current: boolean
  linked: boolean
  preview: boolean
}) {
  const t = useTranslations("grow.courseOverview")
  const locked = step.locked && !preview
  const Icon = step.completed
    ? CircleCheckIcon
    : locked
      ? LockIcon
      : current
        ? CircleDotIcon
        : CircleIcon
  const state = step.completed
    ? t("completed")
    : locked
      ? t("locked")
      : current
        ? t("upNext")
        : t("notStarted")
  const meta = stepMeta(step)
  const metaText =
    meta.kind === "quiz"
      ? [
          t("quizStepMeta", {
            count: meta.questionCount,
            score: meta.passScore,
          }),
          meta.pendingReview ? t("pendingReviewMeta") : null,
          meta.attempts > 0
            ? t("bestAttemptsMeta", {
                score: meta.best ?? 0,
                count: meta.attempts,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          t("lessonMetaTitle"),
          durationText(meta.durationMinutes)?.replace("~", ""),
        ]
          .filter(Boolean)
          .join(" · ")

  const body = (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0",
          step.completed
            ? "text-success"
            : current
              ? "text-primary"
              : "text-muted-foreground"
        )}
        aria-hidden
      />
      <span className="sr-only">{state}: </span>
      <span className="min-w-0 flex-1 truncate">{step.title}</span>
      {current && (
        <Badge variant="muted" className="shrink-0" aria-hidden="true">
          {t("upNext")}
        </Badge>
      )}
      {!step.required && <Badge variant="muted">{t("optional")}</Badge>}
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {metaText}
      </span>
    </>
  )
  const row = "flex items-center gap-3 rounded-md px-2 py-2 text-sm"

  if (locked)
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className={cn(
                row,
                "cursor-not-allowed text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              )}
            >
              {body}
            </div>
          </TooltipTrigger>
          <TooltipContent>{t("completePreviousFirst")}</TooltipContent>
        </Tooltip>
      </li>
    )
  if (!linked)
    return <li className={cn(row, "text-muted-foreground")}>{body}</li>
  return (
    <li>
      <Link
        href={stepHref(courseId, step.id, preview)}
        className={cn(
          row,
          "outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          current && "bg-muted/40 font-medium"
        )}
      >
        {body}
      </Link>
    </li>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-6 md:flex-row md:justify-between">
        <div className="flex gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="flex flex-col gap-3 md:w-72">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-1 w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  )
}
