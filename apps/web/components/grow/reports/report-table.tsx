"use client"

import { useTranslations } from "next-intl"

import type { ReportRow, ReportSort } from "@/lib/grow-api"
import { useDates } from "@/lib/i18n/use-dates"
import { SortHead } from "@/components/shared/sort-head"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { ReportStatus } from "./report-status"

export function ReportTable({
  rows,
  sort,
  order,
  onSort,
  onSelect,
}: {
  rows: ReportRow[]
  sort: ReportSort
  order: "asc" | "desc"
  onSort: (sort: ReportSort) => void
  onSelect: (row: ReportRow) => void
}) {
  const t = useTranslations("grow.reportTable")
  const dates = useDates()
  const date = (value: string | null) => (value ? dates.calendar(value) : "—")
  const rowKey = (row: ReportRow) => `${row.userId}:${row.courseId}`
  const progress = (row: ReportRow) =>
    t("progressCount", { done: row.progress.done, total: row.progress.total })

  return (
    <>
      {/* The outer box scrolls, so the header can stick while a long page scrolls. */}
      <div className="hidden max-h-[calc(100svh-14rem)] min-h-64 overflow-auto rounded-lg border lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
            <TableRow>
              <TableHead className="w-[26%]">{t("person")}</TableHead>
              <TableHead className="w-[30%]">{t("course")}</TableHead>
              <SortHead
                label={t("status")}
                sort="status"
                active={sort === "status"}
                order={order}
                onSort={onSort}
              />
              <TableHead>{t("progress")}</TableHead>
              <SortHead
                label={t("due")}
                sort="due"
                active={sort === "due"}
                order={order}
                onSort={onSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className="cursor-pointer"
                onClick={() => onSelect(row)}
              >
                <TableCell>
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-medium outline-none hover:underline focus-visible:underline"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(row)
                    }}
                  >
                    {row.name}
                  </button>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.area?.name ?? t("noArea")}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block truncate" title={row.courseTitle}>
                    {row.courseTitle}
                  </span>
                </TableCell>
                <TableCell>
                  <ReportStatus
                    state={row.state}
                    dueAt={row.dueAt}
                    variant="dot"
                  />
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
                    <Progress
                      value={
                        row.progress.total
                          ? (row.progress.done / row.progress.total) * 100
                          : 0
                      }
                      aria-hidden
                      className="w-16"
                    />
                    {progress(row)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {date(row.dueAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y overflow-hidden rounded-lg border lg:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.courseTitle}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <ReportStatus
                  state={row.state}
                  dueAt={row.dueAt}
                  variant="dot"
                />
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {progress(row)} · {t("dueDate", { date: date(row.dueAt) })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
