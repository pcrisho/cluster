"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
import { useTranslations } from "next-intl"

import type { ComplianceDashboard, ReportState } from "@/lib/grow-api"
import { useDates } from "@/lib/i18n/use-dates"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useIsBelow } from "@/hooks/use-mobile"

// Status marks use the status tokens (docs/design-system.md); magnitude uses one hue, cat-1.
const STATUS_COLORS = {
  COMPLETED: "var(--success)",
  IN_PROGRESS: "var(--info)",
  NOT_STARTED: "var(--neutral)",
  OVERDUE: "var(--danger)",
} satisfies Record<ReportState, string>
const STACK: ReportState[] = [
  "COMPLETED",
  "IN_PROGRESS",
  "NOT_STARTED",
  "OVERDUE",
]

const ROW = 36
const ANIMATION = 400

/** A category label on one line, cut with an ellipsis (recharts would wrap it). */
function CategoryTick({
  x,
  y,
  payload,
  max,
}: {
  x?: number | string
  y?: number | string
  payload?: { value: string }
  max: number
}) {
  const text = payload?.value ?? ""
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      className="fill-muted-foreground text-xs"
    >
      <title>{text}</title>
      {text.length > max ? `${text.slice(0, max - 1)}…` : text}
    </text>
  )
}

/** One bar per course, split by where its learners are; 2 px card-colour gaps between segments. */
export function StatusByCourseChart({
  courses,
}: {
  courses: ComplianceDashboard["courses"]
}) {
  const t = useTranslations("grow.charts")
  const narrow = useIsBelow(640)
  const config = {
    COMPLETED: { label: t("completed"), color: STATUS_COLORS.COMPLETED },
    IN_PROGRESS: { label: t("inProgress"), color: STATUS_COLORS.IN_PROGRESS },
    NOT_STARTED: { label: t("notStarted"), color: STATUS_COLORS.NOT_STARTED },
    OVERDUE: { label: t("overdue"), color: STATUS_COLORS.OVERDUE },
  } satisfies ChartConfig
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: courses.length * ROW + 72 }}
    >
      <BarChart
        data={courses}
        layout="vertical"
        margin={{ left: 0, right: 8 }}
        barSize={16}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="title"
          width={narrow ? 96 : 160}
          tickLine={false}
          axisLine={false}
          tick={<CategoryTick max={narrow ? 13 : 24} />}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <ChartLegend
          content={
            <ChartLegendContent className="flex-wrap gap-x-4 gap-y-1 [&>div]:whitespace-nowrap" />
          }
        />
        {STACK.map((state, i) => (
          <Bar
            key={state}
            dataKey={state}
            stackId="status"
            fill={`var(--color-${state})`}
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === STACK.length - 1 ? [0, 4, 4, 0] : 0}
            animationDuration={ANIMATION}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** Completion rate per area, the weakest first, labelled at the bar tip. */
export function CompletionByAreaChart({
  areas,
}: {
  areas: ComplianceDashboard["areas"]
}) {
  const t = useTranslations("grow.charts")
  const narrow = useIsBelow(640)
  const config = {
    rate: { label: t("completed"), color: "var(--cat-1)" },
  } satisfies ChartConfig
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: areas.length * ROW + 40 }}
    >
      <BarChart
        data={areas}
        layout="vertical"
        margin={{ left: 0, right: 40 }}
        barSize={16}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={narrow ? 96 : 140}
          tickLine={false}
          axisLine={false}
          tick={<CategoryTick max={narrow ? 13 : 20} />}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(_, __, item) => (
                <span className="text-foreground tabular-nums">
                  {t("completionSummary", {
                    completed: item.payload.completed,
                    total: item.payload.total,
                    rate: item.payload.rate,
                  })}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="rate"
          fill="var(--color-rate)"
          radius={[0, 4, 4, 0]}
          // A 0 % area keeps a sliver, so its label shows.
          minPointSize={2}
          animationDuration={ANIMATION}
        >
          <LabelList
            dataKey="rate"
            position="right"
            className="fill-foreground"
            fontSize={12}
            formatter={(v) => `${v}%`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Completions per week (Monday to Sunday), the current week last. */
export function WeeklyCompletionsChart({
  weekly,
}: {
  weekly: ComplianceDashboard["weekly"]
}) {
  const t = useTranslations("grow.charts")
  const dates = useDates()
  const config = {
    completed: { label: t("completions"), color: "var(--cat-1)" },
  } satisfies ChartConfig
  const label = (week: string) => dates.calendar(week, "monthDay")
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={weekly} margin={{ left: -16, right: 8 }} barSize={20}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickFormatter={label}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(week) =>
                t("weekOf", { date: label(String(week)) })
              }
            />
          }
        />
        <Bar
          dataKey="completed"
          fill="var(--color-completed)"
          radius={[4, 4, 0, 0]}
          animationDuration={ANIMATION}
        />
      </BarChart>
    </ChartContainer>
  )
}

/** Every assignment by state as one segmented bar, with the count of each under it. */
export function StatusMeter({
  summary,
  total,
}: {
  summary: ComplianceDashboard["summary"]
  total: number
}) {
  const t = useTranslations("grow.charts")
  const labels: Record<ReportState, string> = {
    COMPLETED: t("completed"),
    IN_PROGRESS: t("inProgress"),
    NOT_STARTED: t("notStarted"),
    OVERDUE: t("overdue"),
  }
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={STACK.map(
          (state) => `${labels[state]} ${summary[state]}`
        ).join(", ")}
      >
        {STACK.filter((s) => summary[s] > 0).map((state) => (
          <span
            key={state}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(summary[state] / total) * 100}%`,
              background: STATUS_COLORS[state],
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {STACK.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: STATUS_COLORS[state] }}
            />
            <span className="whitespace-nowrap text-muted-foreground">
              {labels[state]}
            </span>
            <span className="font-medium whitespace-nowrap tabular-nums">
              {summary[state]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
