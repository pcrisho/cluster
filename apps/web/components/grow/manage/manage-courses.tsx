"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  GraduationCapIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import {
  growApi,
  isCourseManager,
  type CourseStatus,
  type ManagedCoursesPage,
  type ManagedCourseSort,
} from "@/lib/grow-api"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NewCourseDialog } from "./new-course-dialog"
import { CoursesSkeleton, ManagedCoursesTable } from "./managed-courses-table"
import { TablePagination } from "@/components/shared/table-pagination"

type Filter = CourseStatus | "ALL"

export function ManageCourses() {
  const t = useTranslations("grow.manageCourses")
  const { user } = useAuth()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [filter, setFilter] = useState<Filter>("ALL")
  const [search, setSearch] = useState("")
  const q = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<ManagedCourseSort>("updatedAt")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [result, setResult] = useState<ManagedCoursesPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((value) => value + 1)

  useEffect(() => {
    setBreadcrumb([
      { label: "GROW", href: "/grow" },
      { label: t("breadcrumbManage") },
    ])
  }, [setBreadcrumb, t])

  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setLoading(true)
      try {
        const next = await growApi.listManaged({
          status: filter === "ALL" ? undefined : filter,
          q,
          page,
          pageSize,
          sort,
          order,
        })
        if (active) {
          setResult(next)
          setError(null)
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [filter, q, page, pageSize, sort, order, revision])

  const sortBy = (column: ManagedCourseSort) => {
    setSort(column)
    setOrder(
      sort === column
        ? order === "asc"
          ? "desc"
          : "asc"
        : column === "title"
          ? "asc"
          : "desc"
    )
    setPage(1)
  }
  const clearFilters = () => {
    setSearch("")
    setFilter("ALL")
    setPage(1)
  }
  const isFiltered = filter !== "ALL" || q.trim() !== ""
  const courses = result?.items ?? []

  if (user && !isCourseManager(user)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GraduationCapIcon />
          </EmptyMedia>
          <EmptyTitle>{t("notFound")}</EmptyTitle>
          <EmptyDescription>{t("notFoundDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/grow">{t("backToLearning")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const newCourse = (
    <NewCourseDialog>
      <Button>
        <PlusIcon data-icon="inline-start" />
        {t("newCourse")}
      </Button>
    </NewCourseDialog>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              maxLength={100}
              placeholder={t("searchCourses")}
              aria-label={t("searchCourses")}
            />
          </InputGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={filter}
            onValueChange={(value) => {
              if (value) {
                setFilter(value as Filter)
                setPage(1)
              }
            }}
            aria-label={t("filterByStatus")}
            className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
          >
            {(["ALL", "DRAFT", "PUBLISHED", "ARCHIVED"] as const).map(
              (value) => (
                <ToggleGroupItem key={value} value={value}>
                  {t(
                    (
                      {
                        ALL: "all",
                        DRAFT: "draft",
                        PUBLISHED: "published",
                        ARCHIVED: "archived",
                      } as const
                    )[value]
                  )}
                </ToggleGroupItem>
              )
            )}
          </ToggleGroup>
        </div>
        {newCourse}
      </div>
      <div className="md:hidden">
        <Select
          value={`${sort}:${order}`}
          onValueChange={(value) => {
            const [column, direction] = value.split(":")
            setSort(column as ManagedCourseSort)
            setOrder(direction as "asc" | "desc")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full" aria-label={t("sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="updatedAt:desc">
                {t("updatedNewest")}
              </SelectItem>
              <SelectItem value="updatedAt:asc">
                {t("updatedOldest")}
              </SelectItem>
              <SelectItem value="title:asc">{t("titleAscending")}</SelectItem>
              <SelectItem value="title:desc">{t("titleDescending")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-4" aria-busy={loading}>
        {loading ? (
          <CoursesSkeleton />
        ) : error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>{t("loadFailed")}</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={reload}>
                {t("tryAgain")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : courses.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {isFiltered ? <SearchIcon /> : <GraduationCapIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {isFiltered ? t("noCoursesMatch") : t("noCourses")}
              </EmptyTitle>
              <EmptyDescription>
                {isFiltered ? t("tryAnotherFilter") : t("emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {isFiltered ? (
                <Button variant="outline" onClick={clearFilters}>
                  {t("clearFilters")}
                </Button>
              ) : (
                newCourse
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <ManagedCoursesTable
            courses={courses}
            sort={sort}
            order={order}
            onSort={sortBy}
            onChanged={reload}
          />
        )}
        {!loading && !error && result && (
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </div>
    </div>
  )
}
