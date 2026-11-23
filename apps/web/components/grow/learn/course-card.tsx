import Link from "next/link"
import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { LearnerCourse } from "@/lib/grow-api"
import { durationText } from "@/lib/learner-status"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import {
  LearnerStatusBadge,
  NewBadge,
} from "@/components/grow/learn/learner-status-badge"

/** A course in the catalog and in My learning; the whole card opens the course. */
export function CourseCard({
  course,
  showRestricted,
}: {
  course: LearnerCourse
  /** Course managers see which courses are restricted. */
  showRestricted?: boolean
}) {
  const t = useTranslations("grow.courseCard")
  const meta = [
    t("sectionCount", { count: course.sectionCount }),
    t("stepCount", { count: course.stepCount }),
    durationText(course.durationMinutes),
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Link
      href={`/grow/courses/${course.id}`}
      className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <EntityGlyph
            iconType={course.iconType}
            icon={course.icon}
            emoji={course.emoji}
            fallback="graduation"
            size="md"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 font-medium group-hover:underline">
            {course.title}
          </h3>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
      {course.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {course.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <LearnerStatusBadge state={course.state} dueAt={course.dueAt} />
        {course.isNew && <NewBadge />}
        {showRestricted && course.restricted && (
          <StatusBadge tone="neutral" icon={LockIcon}>
            {t("restricted")}
          </StatusBadge>
        )}
      </div>
    </Link>
  )
}

export function CourseCardSkeleton() {
  return (
    <div className="flex h-40 flex-col gap-3 rounded-xl border p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="mt-auto h-5 w-24 rounded-full" />
    </div>
  )
}
