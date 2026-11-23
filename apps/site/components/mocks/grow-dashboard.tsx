import {
  CalendarClockIcon,
  ChevronDownIcon,
  DownloadIcon,
  TriangleAlertIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { AppWindow } from "@/components/app-frame"
import { demoPeople } from "@/components/fixtures"
import { MockStage, type MockFocus } from "@/components/mock-stage"
import { ScaledScreen } from "@/components/scaled-screen"

// One story across the page: 12 assignments, 7 completed, 3 in progress, 2 not started.
const areaProgress = [
  { key: "sales", value: 0 },
  { key: "engineering", value: 50 },
  { key: "people", value: 50 },
  { key: "design", value: 100 },
  { key: "operations", value: 100 },
] as const

const assignments = [
  { personIndex: 0, status: "completed", progress: 5 },
  { personIndex: 1, status: "inProgress", progress: 3 },
  { personIndex: 2, status: "completed", progress: 5 },
  { personIndex: 3, status: "inProgress", progress: 4 },
  { personIndex: 5, status: "notStarted", progress: 0 },
] as const

const statusDot = {
  completed: "bg-success",
  inProgress: "bg-info",
  notStarted: "bg-neutral",
}

// The Reports tab of the same screen, cropped into its own bento cell.
export function ReportsCard() {
  const t = useTranslations("mocks.grow.reports")
  const data = useTranslations("mocks.data")

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">
          {t("tabReports")}
        </span>
        <span className="flex h-7 items-center gap-2 rounded-lg border border-input px-2.5 text-xs text-foreground">
          <DownloadIcon className="size-3.5" aria-hidden />
          {t("export")}
        </span>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="h-9 border-b border-border">
            <th className="px-4 font-medium">{t("person")}</th>
            <th className="px-2 font-medium">{t("status")}</th>
            <th className="px-2 font-medium">{t("progress")}</th>
            <th className="hidden px-4 font-medium sm:table-cell">
              {t("due")}
            </th>
          </tr>
        </thead>
        <tbody>
          {assignments.map(({ personIndex, progress, status }) => {
            const person = demoPeople[personIndex]
            return (
              <tr
                className="h-12 border-b border-border last:border-0"
                key={person.key}
              >
                <td className="px-4">
                  <span className="block truncate font-medium text-foreground">
                    {person.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {data(`areas.${person.area}`)}
                  </span>
                </td>
                <td className="px-2">
                  <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-foreground">
                    <span
                      className={`size-1.5 rounded-full ${statusDot[status]}`}
                      aria-hidden
                    />
                    {t(status)}
                  </span>
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2 text-xs whitespace-nowrap text-foreground tabular-nums">
                    <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${progress * 20}%` }}
                      />
                    </span>
                    {t("progressValue", { progress })}
                  </span>
                </td>
                <td className="hidden px-4 whitespace-nowrap text-foreground sm:table-cell">
                  {t("dueDate")}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FilterMock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="flex h-8 items-center justify-between gap-3 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground">
        <span className="truncate">{value}</span>
        <ChevronDownIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </span>
    </div>
  )
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

export function GrowDashboardMock({
  focus,
  width,
}: {
  focus?: MockFocus
  width?: number
}) {
  const t = useTranslations("mocks.grow.dashboard")
  const alt = useTranslations("mocks")
  const data = useTranslations("mocks.data")

  return (
    <MockStage description={alt("growDashboardAlt")} focus={focus}>
      <ScaledScreen width={width}>
        <AppWindow
          crumbs={[
            { label: "GROW" },
            { label: t("tabDashboard"), current: true },
          ]}
        >
          <div className="bg-background p-6">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {t("title")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>

            <div className="mt-4 flex items-center gap-5 overflow-hidden border-b border-border px-2 text-sm">
              {[
                "tabMyLearning",
                "tabCatalog",
                "tabCertificates",
                "tabManage",
                "tabDashboard",
                "tabReports",
              ].map((key) => (
                <span
                  className={`flex h-9 shrink-0 items-center border-b-2 ${key === "tabDashboard" ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground"}`}
                  key={key}
                >
                  {t(key)}
                </span>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 items-end gap-3 xl:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_auto]">
              <FilterMock label={t("courseFilter")} value={t("allCourses")} />
              <FilterMock label={t("areaFilter")} value={t("allAreas")} />
              <div className="flex h-8 items-center gap-2 text-sm text-foreground">
                <span className="flex h-5 w-9 items-center rounded-full bg-muted p-0.5">
                  <span className="size-4 rounded-full bg-background shadow-xs" />
                </span>
                <span className="whitespace-nowrap">
                  {t("includeArchived")}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="col-span-2 row-span-2 flex flex-col justify-between rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t("completionRate")}
                  </div>
                  <div className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
                    {t("completionValue")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {t("completionCount")}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    <span className="bg-success" style={{ width: "58%" }} />
                    <span className="bg-info" style={{ width: "25%" }} />
                    <span className="flex-1 bg-neutral" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                    <span>
                      <span
                        aria-hidden
                        className="mr-1 inline-block size-2 rounded-full bg-success"
                      />
                      {t("completed")}{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        7
                      </b>
                    </span>
                    <span>
                      <span
                        aria-hidden
                        className="mr-1 inline-block size-2 rounded-full bg-info"
                      />
                      {t("inProgress")}{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        3
                      </b>
                    </span>
                    <span>
                      <span
                        aria-hidden
                        className="mr-1 inline-block size-2 rounded-full bg-neutral"
                      />
                      {t("notStarted")}{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        2
                      </b>
                    </span>
                    <span>
                      <span
                        aria-hidden
                        className="mr-1 inline-block size-2 rounded-full bg-danger"
                      />
                      {t("overdueStatus")}{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        0
                      </b>
                    </span>
                  </div>
                </div>
              </div>
              <MetricTile
                icon={<UsersIcon className="size-4" aria-hidden />}
                label={t("assignedLabel")}
                value={t("assigned")}
              />
              <MetricTile
                icon={
                  <TriangleAlertIcon
                    className="size-4 text-danger"
                    aria-hidden
                  />
                }
                label={t("overdueLabel")}
                value={t("overdue")}
              />
              <MetricTile
                icon={
                  <CalendarClockIcon
                    className="size-4 text-warning"
                    aria-hidden
                  />
                }
                label={t("dueSoonLabel")}
                value={t("dueSoon")}
              />
              <MetricTile
                icon={<TrophyIcon className="size-4" aria-hidden />}
                label={t("averageScore")}
                value={t("averageScoreValue")}
              />
            </div>

            <div className="mt-5 grid items-start gap-3 xl:grid-cols-2">
              <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="text-sm font-semibold text-foreground">
                  {t("statusByCourse")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("statusByCourseDesc")}
                </p>
                <div className="mt-7 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-28 shrink-0 truncate">
                    {t("workplaceCourse")}
                  </span>
                  <div className="flex h-5 min-w-0 flex-1 overflow-hidden">
                    <span className="w-7/12 border-r border-background bg-success" />
                    <span className="w-1/4 border-r border-background bg-info" />
                    <span className="flex-1 bg-neutral" />
                  </div>
                </div>
                <div className="mt-3 flex justify-center gap-4 text-2xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="size-2 rounded-full bg-success"
                    />
                    {t("completed")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-2 rounded-full bg-info" />
                    {t("inProgress")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="size-2 rounded-full bg-neutral"
                    />
                    {t("notStarted")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="size-2 rounded-full bg-danger"
                    />
                    {t("overdueStatus")}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="text-sm font-semibold text-foreground">
                  {t("completionByArea")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("completionByAreaDesc")}
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  {areaProgress.map(({ key, value }) => (
                    <div
                      className="grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs"
                      key={key}
                    >
                      <span className="truncate text-right text-muted-foreground">
                        {data(`areas.${key}`)}
                      </span>
                      <div className="h-4 border-l border-border bg-muted/30">
                        <div
                          className="h-full rounded-r bg-primary"
                          style={{ width: value ? `${value}%` : "2px" }}
                        />
                      </div>
                      <span className="text-foreground tabular-nums">
                        {value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </AppWindow>
      </ScaledScreen>
    </MockStage>
  )
}
