"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ListChecksIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { getErrorMessage } from "@/lib/api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import {
  growApi,
  type LearnerCourse,
  type MyLearning as MyLearningData,
} from "@/lib/grow-api"
import { useDates } from "@/lib/i18n/use-dates"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import {
  CourseCard,
  CourseCardSkeleton,
} from "@/components/grow/learn/course-card"
import {
  LearnerStatusBadge,
  NewBadge,
} from "@/components/grow/learn/learner-status-badge"

/** Completed courses beyond this many fold under "Completed (n)". */
const COMPLETED_SHOWN = 3

/** The learner's landing: what is required of them, what they started and what to take next. */
export function MyLearning() {
  const t = useTranslations("grow.myLearningPage")
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [data, setData] = useState<MyLearningData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumb([{ label: "GROW" }])
  }, [setBreadcrumb])

  const load = useCallback(async () => {
    try {
      setData(await growApi.getLearning())
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  if (error)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t("loadErrorTitle")}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => void load()}>
            {t("tryAgain")}
          </Button>
        </EmptyContent>
      </Empty>
    )

  if (!data) return <MyLearningSkeleton />

  const pending = data.required.filter((c) => c.state !== "COMPLETED")
  const completed = data.required.filter((c) => c.state === "COMPLETED")

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="required-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="required-heading" className="text-base font-semibold">
            {t("requiredForYou")}
          </h2>
          {pending.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("pendingCount", { count: pending.length })}
            </span>
          )}
        </div>
        {data.required.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ListChecksIcon className="size-4 shrink-0" aria-hidden />
            {t("nothingRequired")}
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {[...pending, ...completed.slice(0, COMPLETED_SHOWN)].map((c) => (
                <RequiredRow key={c.id} course={c} />
              ))}
            </ul>
            {completed.length > COMPLETED_SHOWN && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group">
                    <ChevronDownIcon
                      data-icon="inline-start"
                      className="transition-transform group-data-[state=open]:rotate-180"
                    />
                    {t("moreCompleted", {
                      count: completed.length - COMPLETED_SHOWN,
                    })}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-2 divide-y rounded-lg border">
                    {completed.slice(COMPLETED_SHOWN).map((c) => (
                      <RequiredRow key={c.id} course={c} />
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </section>

      {data.inProgress.length > 0 && (
        <CardsSection title={t("continueLearning")} id="continue">
          {data.inProgress.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </CardsSection>
      )}

      <CardsSection
        title={t("recommended")}
        id="recommended"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/grow/catalog">
              {t("seeCatalog")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        }
      >
        {data.recommended.length === 0 ? (
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            {t("noRecommendations")}
          </p>
        ) : (
          data.recommended.map((c) => <CourseCard key={c.id} course={c} />)
        )}
      </CardsSection>
    </div>
  )
}

function RequiredRow({ course }: { course: LearnerCourse }) {
  const t = useTranslations("grow.myLearningPage")
  const tStatus = useTranslations("grow.learnerStatus")
  const dates = useDates()
  const { done, total } = course.progress
  const action =
    course.state === "COMPLETED"
      ? "review"
      : course.state === "NOT_STARTED" ||
          (course.state === "OVERDUE" && done === 0)
        ? "start"
        : "continue"
  return (
    <li className="relative flex flex-col gap-3 p-3 hover:bg-muted/40 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <EntityGlyph
          iconType={course.iconType}
          icon={course.icon}
          emoji={course.emoji}
          fallback="graduation"
          size="md"
          className="shrink-0 text-muted-foreground"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{course.title}</span>
            {course.isNew && <NewBadge />}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <LearnerStatusBadge state={course.state} dueAt={course.dueAt} />
            {course.dueAt && course.state !== "COMPLETED" && (
              <span>
                {tStatus("dueDate", {
                  date: dates.calendar(course.dueAt, "monthDay"),
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:w-64">
        <div className="flex flex-1 flex-col gap-1">
          <Progress
            value={total ? (done / total) * 100 : 0}
            aria-label={t("courseProgress", { course: course.title })}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("progressCount", { done, total })}
          </p>
        </div>
        <Button
          asChild
          size="sm"
          variant={action === "review" ? "outline" : "default"}
        >
          {/* The whole row opens the course; the button stays the one focus target. */}
          <Link
            href={`/grow/courses/${course.id}`}
            className="after:absolute after:inset-0"
            aria-label={t("actionForCourse", {
              action: t(action),
              course: course.title,
            })}
          >
            {t(action)}
          </Link>
        </Button>
      </div>
    </li>
  )
}

function CardsSection({
  title,
  id,
  action,
  children,
}: {
  title: string
  id: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function MyLearningSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <div className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-5 rounded" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="hidden h-8 w-56 sm:block" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
