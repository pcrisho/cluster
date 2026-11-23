import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleCheckIcon,
  CircleIcon,
  LockKeyholeIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { AppWindow } from "@/components/app-frame"
import { MockStage, type MockFocus } from "@/components/mock-stage"
import { ScaledScreen } from "@/components/scaled-screen"

function LessonRow({
  active = false,
  done = false,
  label,
  locked = false,
}: {
  active?: boolean
  done?: boolean
  label: string
  locked?: boolean
}) {
  const Icon = done ? CircleCheckIcon : locked ? LockKeyholeIcon : CircleIcon

  return (
    <div
      className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${
        active
          ? "bg-accent font-medium text-accent-foreground"
          : locked
            ? "text-muted-foreground"
            : "text-foreground"
      }`}
    >
      <Icon
        className={`size-4 shrink-0 ${done ? "text-success" : active ? "text-primary" : "text-muted-foreground"}`}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </div>
  )
}

function CourseSection({
  count,
  label,
  children,
}: {
  count: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 px-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{count}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

export function GrowPlayerMock({
  focus,
  width,
}: {
  focus?: MockFocus
  width?: number
}) {
  const t = useTranslations("mocks.grow")
  const alt = useTranslations("mocks")

  return (
    <MockStage description={alt("growPlayerAlt")} focus={focus}>
      <ScaledScreen width={width}>
        <AppWindow
          sidebar
          crumbs={[
            { label: "GROW" },
            { label: t("courseTitle") },
            { label: t("learn"), current: true },
          ]}
        >
          <div className="flex min-h-[520px] bg-background">
            <aside className="hidden w-72 shrink-0 flex-col gap-4 border-r border-border p-3 md:flex">
              <div className="px-2 text-sm font-semibold text-foreground">
                {t("courseTitle")}
              </div>
              <CourseSection
                count={t("beforeStartCount")}
                label={t("beforeStart")}
              >
                <LessonRow done label={t("welcome")} />
                <LessonRow done label={t("reportingHazard")} />
              </CourseSection>
              <CourseSection
                count={t("fireSafetyCount")}
                label={t("fireSafety")}
              >
                <LessonRow done label={t("fireExtinguishers")} />
                <LessonRow active label={t("evacuationRoutes")} />
                <LessonRow locked label={t("furtherReading")} />
              </CourseSection>
              <CourseSection
                count={t("checkKnowledgeCount")}
                label={t("checkKnowledge")}
              >
                <LessonRow locked label={t("safetyQuiz")} />
              </CourseSection>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-8 shrink-0 items-center justify-end gap-4 border-b border-border px-4 text-xs text-muted-foreground">
                <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-3/5 rounded-full bg-primary" />
                </div>
                <span className="tabular-nums">{t("progress")}</span>
              </div>
              <div className="flex flex-1 flex-col px-6 py-8 sm:px-12 lg:px-16">
                <div className="mx-auto w-full max-w-2xl flex-1">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">
                    {t("evacuationRoutes")}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t("lessonLabel")}</span>
                    <span aria-hidden>·</span>
                    <span>{t("lessonDuration")}</span>
                  </div>
                  <div className="mt-10 text-base leading-relaxed text-foreground">
                    {t("alarmIntro")}
                  </div>
                  <ol className="mt-2 flex list-decimal flex-col gap-2 pl-7 text-base leading-relaxed text-foreground marker:text-muted-foreground">
                    <li className="pl-1">{t("instruction1")}</li>
                    <li className="pl-1">{t("instruction2")}</li>
                    <li className="pl-1">{t("instruction3")}</li>
                  </ol>
                  <p className="mt-3 text-base leading-relaxed text-foreground">
                    {t("lessonClosing")}
                  </p>
                </div>
              </div>
              <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-t border-border px-6 lg:px-16">
                <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                  <ArrowLeftIcon className="size-4" aria-hidden />
                  {t("previous")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium whitespace-nowrap text-primary-foreground">
                  {t("completeContinue")}
                  <ArrowRightIcon className="size-4" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </AppWindow>
      </ScaledScreen>
    </MockStage>
  )
}
