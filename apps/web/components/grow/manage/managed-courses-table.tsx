"use client"

import Link from "next/link"
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { ManagedCourse, ManagedCourseSort } from "@/lib/grow-api"
import { useAuth } from "@/lib/auth-context"
import { useDates } from "@/lib/i18n/use-dates"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { CourseActionsMenu } from "@/components/grow/course-actions-menu"
import { CourseStatusBadge } from "@/components/grow/course-status-badge"
import { PendingReviewsBadge } from "@/components/grow/pending-reviews-badge"

function SortHead({
  column,
  label,
  active,
  order,
  onSort,
}: {
  column: ManagedCourseSort
  label: string
  active: boolean
  order: "asc" | "desc"
  onSort: (column: ManagedCourseSort) => void
}) {
  const Icon = active
    ? order === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon
  return (
    <TableHead
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 px-2"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon data-icon="inline-end" />
      </Button>
    </TableHead>
  )
}

export function ManagedCoursesTable({
  courses,
  sort,
  order,
  onSort,
  onChanged,
}: {
  courses: ManagedCourse[]
  sort: ManagedCourseSort
  order: "asc" | "desc"
  onSort: (sort: ManagedCourseSort) => void
  onChanged: () => void
}) {
  const t = useTranslations("grow.manageCourses")
  const tg = useTranslations("grow")
  // While main nodes are isolated, a course that is not restricted is visible to every one of them.
  const isolated = useAuth().user?.organization.isolated ?? false
  const dates = useDates()
  const contentSummary = (course: ManagedCourse) =>
    t("contentSummary", {
      sections: course.sectionCount,
      steps: course.stepCount,
    })
  const learnersSummary = (course: ManagedCourse) =>
    course.learnerCount === 0
      ? "—"
      : t("learnerSummary", {
          learners: course.learnerCount,
          completed: course.completedCount,
        })
  const actions = (course: ManagedCourse) => (
    <CourseActionsMenu
      course={course}
      withEdit
      onChanged={onChanged}
      onDeleted={onChanged}
    />
  )

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <SortHead
                column="title"
                label={t("course")}
                active={sort === "title"}
                order={order}
                onSort={onSort}
              />
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("learners")}</TableHead>
              <SortHead
                column="updatedAt"
                label={t("updated")}
                active={sort === "updatedAt"}
                order={order}
                onSort={onSort}
              />
              <TableHead>{t("createdBy")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => (
              <TableRow key={course.id}>
                <TableCell className="max-w-72 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <EntityGlyph
                        iconType={course.iconType}
                        icon={course.icon}
                        emoji={course.emoji}
                        fallback="graduation"
                        size="md"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/grow/courses/${course.id}/edit`}
                        className="truncate font-medium outline-none hover:underline focus-visible:underline"
                      >
                        {course.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {contentSummary(course)}
                        <PendingReviewsBadge
                          courseId={course.id}
                          count={course.pendingReviews}
                        />
                        {isolated && !course.restricted && (
                          <span>{tg("visibleToEveryMainNode")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <CourseStatusBadge status={course.status} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {learnersSummary(course)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="cursor-default">
                      {dates.relative(course.updatedAt)}
                    </TooltipTrigger>
                    <TooltipContent>
                      {dates.instant(course.updatedAt, "dateTime")}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {course.createdBy
                    ? `${course.createdBy.firstName} ${course.createdBy.lastName}`
                    : "—"}
                </TableCell>
                <TableCell>{actions(course)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border md:hidden">
        {courses.map((course) => (
          <li key={course.id} className="flex items-center gap-3 p-4">
            <EntityGlyph
              iconType={course.iconType}
              icon={course.icon}
              emoji={course.emoji}
              fallback="graduation"
              size="md"
              className="shrink-0 text-muted-foreground"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Link
                href={`/grow/courses/${course.id}/edit`}
                className="truncate font-medium outline-none hover:underline focus-visible:underline"
              >
                {course.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <CourseStatusBadge status={course.status} />
                <PendingReviewsBadge
                  courseId={course.id}
                  count={course.pendingReviews}
                />
                {isolated && !course.restricted && (
                  <span className="text-xs text-muted-foreground">
                    {tg("visibleToEveryMainNode")}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {[
                  contentSummary(course),
                  course.learnerCount > 0 && learnersSummary(course),
                  dates.relative(course.updatedAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {actions(course)}
          </li>
        ))}
      </ul>
    </>
  )
}

export function CoursesSkeleton() {
  return (
    <div className="rounded-xl border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b p-4 last:border-b-0"
        >
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          <Skeleton className="hidden h-4 w-28 md:block" />
        </div>
      ))}
    </div>
  )
}
