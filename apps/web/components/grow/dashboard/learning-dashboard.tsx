"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRightIcon,
  CalendarClockIcon,
  ChartColumnIcon,
  SearchIcon,
  TriangleAlertIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import {
  canViewReports,
  growApi,
  type ComplianceDashboard,
} from "@/lib/grow-api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { FilterSelect } from "@/components/grow/reports/report-filters"
import { ReportStatus } from "@/components/grow/reports/report-status"
import {
  CompletionByAreaChart,
  StatusByCourseChart,
  StatusMeter,
  WeeklyCompletionsChart,
} from "./dashboard-charts"

type Filters = {
  courseId?: string
  orgNodeId?: string
  scope?: "assigned" | "all"
}

/** The report as figures and charts: same people, same scope, same course and area filters. */
export function LearningDashboard() {
  const t = useTranslations("grow.dashboardContent")
  const { user } = useAuth()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo<Filters>(
    () => ({
      courseId: searchParams.get("courseId") ?? undefined,
      orgNodeId: searchParams.get("orgNodeId") ?? undefined,
      scope: searchParams.get("scope") === "all" ? "all" : undefined,
    }),
    [searchParams]
  )
  const [data, setData] = useState<ComplianceDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumb([{ label: "GROW", href: "/grow" }, { label: t("title") }])
  }, [setBreadcrumb, t])

  const allowed = !user || canViewReports(user)
  const load = useCallback(async () => {
    try {
      setData(
        await growApi.getComplianceDashboard({
          courseId: filters.courseId ? [filters.courseId] : undefined,
          orgNodeId: filters.orgNodeId ? [filters.orgNodeId] : undefined,
          scope: filters.scope,
        })
      )
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [filters])

  useEffect(() => {
    if (allowed) Promise.resolve().then(load)
  }, [allowed, load])

  const update = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch))
      if (value) next.set(key, value)
      else next.delete(key)
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    })
  }
  // The same filters, carried to the full report.
  const reportHref = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v) as [string, string][]
      ),
      ...extra,
    })
    return `/grow/reports${query.size ? `?${query}` : ""}`
  }

  if (!allowed)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>{t("notFoundTitle")}</EmptyTitle>
          <EmptyDescription>{t("notFoundDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="flex flex-col gap-6">
      {data && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
            <FilterSelect
              id="dashboard-course"
              label={t("course")}
              value={filters.courseId}
              options={data.filters.courses.map((course) => ({
                id: course.id,
                name: course.archived
                  ? t("archivedCourse", { course: course.name })
                  : course.name,
              }))}
              onChange={(courseId) => update({ courseId })}
            />
            <FilterSelect
              id="dashboard-area"
              label={t("area")}
              value={filters.orgNodeId}
              options={data.filters.areas}
              onChange={(orgNodeId) => update({ orgNodeId })}
            />
          </div>
          <Field orientation="horizontal" className="w-fit sm:pb-1.5">
            <Switch
              id="dashboard-scope"
              checked={filters.scope === "all"}
              onCheckedChange={(on) =>
                update({ scope: on ? "all" : undefined })
              }
            />
            <FieldLabel htmlFor="dashboard-scope">
              {t("includeArchivedVoluntary")}
            </FieldLabel>
          </Field>
        </div>
      )}

      {error ? (
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
      ) : !data ? (
        <DashboardSkeleton />
      ) : data.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartColumnIcon />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {filters.courseId || filters.orgNodeId
                ? t("emptyDescriptionFiltered")
                : t("emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="col-span-2 lg:row-span-2">
              <CardHeader>
                <CardDescription>{t("completionRate")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-6">
                <div className="flex flex-col gap-1">
                  <p className="text-5xl font-semibold tracking-tight">
                    {data.completionRate ?? 0}%
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("completionSummary", {
                      completed: data.summary.COMPLETED,
                      total: data.total,
                    })}
                  </p>
                </div>
                <StatusMeter summary={data.summary} total={data.total} />
              </CardContent>
            </Card>
            <Tile icon={UsersIcon} label={t("assigned")} value={data.total} />
            <Tile
              icon={TriangleAlertIcon}
              tone="text-danger"
              label={t("overdue")}
              value={data.summary.OVERDUE}
              href={reportHref({ status: "OVERDUE" })}
            />
            <Tile
              icon={CalendarClockIcon}
              tone="text-warning"
              label={t("dueInSevenDays")}
              value={data.dueSoon}
              href={reportHref({ sort: "due" })}
            />
            <Tile
              icon={TrophyIcon}
              label={t("averageBestScore")}
              value={data.averageScore === null ? "—" : `${data.averageScore}%`}
            />
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            <Panel
              title={t("statusByCourse")}
              description={
                data.courseCount > data.courses.length
                  ? t("topCoursesDescription", {
                      count: data.courses.length,
                      total: data.courseCount,
                    })
                  : t("statusByCourseDescription")
              }
            >
              <StatusByCourseChart courses={data.courses} />
            </Panel>
            <Panel
              title={t("completionByArea")}
              description={
                data.areaCount > data.areas.length
                  ? t("areasBehindDescription", {
                      count: data.areas.length,
                      total: data.areaCount,
                    })
                  : t("completionByAreaDescription")
              }
            >
              <CompletionByAreaChart areas={data.areas} />
            </Panel>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[2fr_1fr]">
            <Panel
              title={t("completionsPerWeek")}
              description={t("completionsPerWeekDescription")}
            >
              <WeeklyCompletionsChart weekly={data.weekly} />
            </Panel>
            <Panel
              title={t("needsAttention")}
              description={t("longestOverdue")}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href={reportHref({ status: "OVERDUE" })}>
                    {t("seeAll")}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              }
            >
              {data.attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("nobodyOverdue")}
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.attention.map((item) => (
                    <li
                      key={`${item.userId}:${item.courseId}`}
                      className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        <ReportStatus state="OVERDUE" dueAt={item.dueAt} />
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {item.courseTitle}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
  href,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  tone?: string
  href?: string
}) {
  const body = (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className={cn("size-4", tone)} aria-hidden />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
  return href ? (
    <Link
      href={href}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 hover:[&>*]:ring-foreground/20"
    >
      {body}
    </Link>
  ) : (
    body
  )
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {action && (
          <div
            data-slot="card-action"
            className="col-start-2 row-span-2 row-start-1 self-start"
          >
            {action}
          </div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-48 lg:row-span-2" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}
