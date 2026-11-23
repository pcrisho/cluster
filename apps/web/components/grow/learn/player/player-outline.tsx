"use client"

import Link from "next/link"
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  LockIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { stepHref } from "@/lib/course-outline"
import type { CourseOverview } from "@/lib/grow-api"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

/** The course outline beside the player: every step with its state; locked steps are not links. */
export function PlayerOutline({
  course,
  currentStepId,
  preview,
  onNavigate,
}: {
  course: CourseOverview
  currentStepId: string
  preview: boolean
  onNavigate?: () => void
}) {
  const t = useTranslations("grow.playerOutline")
  return (
    <nav
      aria-label={t("courseOutline")}
      className="flex h-full min-h-0 flex-col gap-2 p-3"
    >
      <Link
        href={`/grow/courses/${course.id}${preview ? "?preview=1" : ""}`}
        onClick={onNavigate}
        className="truncate rounded-md px-2 py-1.5 font-semibold outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {course.title}
      </Link>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-3 pb-4">
          {course.sections.map((section, index) => (
            <li key={section.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <span className="truncate">
                  {index + 1}. {section.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {section.steps.filter((s) => s.completed).length}/
                  {section.steps.length}
                </span>
              </div>
              <ul>
                {section.steps.map((step) => {
                  const current = step.id === currentStepId
                  const locked = step.locked && !preview
                  const Icon = step.completed
                    ? CircleCheckIcon
                    : locked
                      ? LockIcon
                      : current
                        ? CircleDotIcon
                        : CircleIcon
                  const body = (
                    <>
                      <Icon
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0",
                          step.completed
                            ? "text-success"
                            : current
                              ? "text-primary"
                              : "text-muted-foreground"
                        )}
                      />
                      <span className="sr-only">
                        {step.completed
                          ? `${t("completed")}: `
                          : locked
                            ? `${t("locked")}: `
                            : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {step.title}
                      </span>
                    </>
                  )
                  return (
                    <li key={step.id}>
                      {locked ? (
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                            "text-muted-foreground"
                          )}
                          title={t("completePreviousFirst")}
                        >
                          {body}
                        </div>
                      ) : (
                        <Link
                          href={stepHref(course.id, step.id, preview)}
                          onClick={onNavigate}
                          aria-current={current ? "step" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                            "outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            current && "bg-muted font-medium"
                          )}
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </nav>
  )
}
