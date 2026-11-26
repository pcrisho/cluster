"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  AwardIcon,
  DownloadIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { useDates } from "@/lib/i18n/use-dates"
import {
  canViewReports,
  growApi,
  type ComplianceReport,
  type ReportFilters,
  type ReportRow,
  type ReportSort,
  type ReportState,
} from "@/lib/grow-api"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { TablePagination } from "@/components/shared/table-pagination"
import { cn } from "@/lib/utils"
import {
  REPORT_STATES,
  ReportFilters as ReportFiltersBar,
} from "./report-filters"
import { ReportStatus } from "./report-status"
import { ReportTable } from "./report-table"

const PAGE_SIZE = 25
const PAGE_SIZES = [10, 25, 50]

function listParam(search: URLSearchParams, key: string): string[] | undefined {
  const values = [
    ...new Set(
      search
        .getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ]
  return values.length ? values : undefined
}

function filtersFrom(search: URLSearchParams): ReportFilters {
  const states = listParam(search, "status")?.filter((value) =>
    (REPORT_STATES as string[]).includes(value)
  ) as ReportState[] | undefined
  return {
    courseId: listParam(search, "courseId"),
    orgNodeId: listParam(search, "orgNodeId"),
    positionId: listParam(search, "positionId"),
    status: states?.length ? states : undefined,
    scope: search.get("scope") === "all" ? "all" : undefined,
    sort: search.get("sort") === "due" ? "due" : undefined,
    order: search.get("order") === "desc" ? "desc" : undefined,
    q: search.get("q") ?? undefined,
    page: Math.max(1, Number(search.get("page")) || 1),
    pageSize: PAGE_SIZES.includes(Number(search.get("pageSize")))
      ? Number(search.get("pageSize"))
      : PAGE_SIZE,
  }
}

function saveCsv(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `compliance-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ComplianceReports() {
  const t = useTranslations("grow.reportMessages")
  const tTable = useTranslations("grow.reportTable")
  const dates = useDates()
  const { user } = useAuth()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo(
    () => filtersFrom(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )
  const [search, setSearch] = useState(filters.q ?? "")
  // Adopt a search that arrives through the URL (back button, a shared link, Clear filters).
  const [urlSearch, setUrlSearch] = useState(filters.q ?? "")
  if ((filters.q ?? "") !== urlSearch) {
    setUrlSearch(filters.q ?? "")
    setSearch(filters.q ?? "")
  }
  const debouncedSearch = useDebounce(search, 300)
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const [personRows, setPersonRows] = useState<ReportRow[] | null>(null)
  // The sheet opens from code, not from a trigger, so it gives focus back by hand.
  const sheetOpener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setBreadcrumb([{ label: "GROW", href: "/grow" }, { label: t("title") }])
  }, [setBreadcrumb, t])

  const updateFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
          if (value.length) next.set(key, value.join(","))
          else next.delete(key)
        } else if (value === undefined || value === "" || value === 1)
          next.delete(key)
        else next.set(key, String(value))
      }
      if (!("page" in patch)) next.delete("page")
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      })
    },
    [pathname, router, searchParams]
  )

  // Only a settled input writes the URL: a stale debounced value would put back a cleared search.
  useEffect(() => {
    if (debouncedSearch === search && debouncedSearch !== (filters.q ?? ""))
      updateFilters({ q: debouncedSearch || undefined })
  }, [debouncedSearch, search, filters.q, updateFilters])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await growApi.getComplianceReport(filters))
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filters])

  const allowed = !user || canViewReports(user)
  useEffect(() => {
    if (allowed) Promise.resolve().then(load)
  }, [allowed, load])

  const clearFilters = () => router.replace(pathname, { scroll: false })

  const openPerson = async (row: ReportRow) => {
    sheetOpener.current = document.activeElement as HTMLElement | null
    setSelected(row)
    setPersonRows(null)
    try {
      const detail = await growApi.getComplianceReport({
        q: row.email,
        scope: filters.scope,
        pageSize: 100,
      })
      setPersonRows(detail.rows.filter((item) => item.userId === row.userId))
    } catch (err) {
      toast.error(getErrorMessage(err))
      setPersonRows([])
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      saveCsv(await growApi.exportComplianceReport(filters))
      toast.success(t("exported"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  if (user && !canViewReports(user)) {
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
  }

  const hasFilters =
    !!filters.courseId?.length ||
    !!filters.orgNodeId?.length ||
    !!filters.positionId?.length ||
    !!filters.status?.length ||
    filters.scope === "all" ||
    !!filters.q
  const assigned = report
    ? REPORT_STATES.reduce((sum, state) => sum + report.summary[state], 0)
    : 0
  const sortBy = (sort: ReportSort) =>
    updateFilters({
      sort: sort === "due" ? "due" : undefined,
      order:
        (filters.sort ?? "status") === sort && filters.order !== "desc"
          ? "desc"
          : undefined,
    })

  return (
    <div className="flex flex-col gap-4">
      {report && (
        <ReportFiltersBar
          filters={filters}
          options={report.filters}
          summary={report.summary}
          total={assigned}
          search={search}
          onSearch={setSearch}
          onChange={updateFilters}
          onClear={clearFilters}
          action={
            <Button
              variant="outline"
              disabled={exporting}
              aria-busy={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {exporting ? t("exporting") : t("exportCsv")}
            </Button>
          }
        />
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
      ) : report === null ? (
        <ReportsSkeleton />
      ) : (
        <>
          {report.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>{t("noMatchesTitle")}</EmptyTitle>
                <EmptyDescription>{t("noMatchesDescription")}</EmptyDescription>
              </EmptyHeader>
              {hasFilters && (
                <EmptyContent>
                  <Button variant="outline" onClick={clearFilters}>
                    {t("clearFilters")}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div
              aria-busy={loading}
              className={cn(
                "flex flex-col gap-4 transition-opacity",
                loading && "opacity-60"
              )}
            >
              <Select
                value={`${filters.sort ?? "status"}:${filters.order ?? "asc"}`}
                onValueChange={(value) => {
                  const [sort, order] = value.split(":")
                  updateFilters({
                    sort: sort === "due" ? "due" : undefined,
                    order: order === "desc" ? "desc" : undefined,
                  })
                }}
              >
                <SelectTrigger
                  className="w-full lg:hidden"
                  aria-label={tTable("sortBy")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="status:asc">
                      {tTable("sortUrgency")}
                    </SelectItem>
                    <SelectItem value="status:desc">
                      {tTable("sortCompletedFirst")}
                    </SelectItem>
                    <SelectItem value="due:asc">
                      {tTable("sortDueSoonest")}
                    </SelectItem>
                    <SelectItem value="due:desc">
                      {tTable("sortDueLatest")}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ReportTable
                rows={report.rows}
                sort={filters.sort ?? "status"}
                order={filters.order ?? "asc"}
                onSort={sortBy}
                onSelect={openPerson}
              />
              <TablePagination
                page={report.page}
                pageSize={report.pageSize}
                total={report.total}
                pageSizes={PAGE_SIZES}
                onPageChange={(page) => updateFilters({ page })}
                onPageSizeChange={(pageSize) =>
                  updateFilters({
                    pageSize: pageSize === PAGE_SIZE ? undefined : pageSize,
                    page: undefined,
                  })
                }
              />
            </div>
          )}
        </>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            sheetOpener.current?.focus()
          }}
        >
          <SheetHeader>
            <SheetTitle>{selected?.name ?? t("learner")}</SheetTitle>
            <SheetDescription>{selected?.email}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 p-4">
            {personRows === null ? (
              <>
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </>
            ) : personRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noCourseDetails")}
              </p>
            ) : (
              personRows.map((row) => (
                <Card key={row.courseId} size="sm">
                  <CardHeader>
                    <CardTitle>{row.courseTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <ReportStatus state={row.state} dueAt={row.dueAt} />
                    <p className="text-sm text-muted-foreground">
                      {t("stepsCompleted", {
                        done: row.progress.done,
                        total: row.progress.total,
                      })}
                      {row.completedAt
                        ? t("completedOn", {
                            date: dates.calendar(row.completedAt),
                          })
                        : ""}
                    </p>
                    {row.attempts > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t("attemptSummary", {
                          score:
                            row.bestScore === null
                              ? t("notScoredYet")
                              : `${row.bestScore}%`,
                          count: row.attempts,
                        })}
                      </p>
                    )}
                    {row.certificateCode && (
                      <p className="flex items-center gap-1.5 text-sm">
                        <AwardIcon className="size-4 text-muted-foreground" />
                        {t("certificate")}{" "}
                        <Link
                          href={`/verify/${row.certificateCode}`}
                          target="_blank"
                          className="font-mono underline underline-offset-4"
                        >
                          {row.certificateCode}
                        </Link>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ReportsSkeleton() {
  const t = useTranslations("grow.reportMessages")
  return (
    <div className="flex flex-col gap-4" aria-label={t("loadingReports")}>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-8 w-96 max-w-full" />
      <Skeleton className="h-72" />
    </div>
  )
}
