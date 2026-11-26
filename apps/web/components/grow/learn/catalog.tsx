"use client"

import { useCallback, useEffect, useState } from "react"
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
  type CatalogFilter,
  type LearnerCourse,
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
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CourseCard,
  CourseCardSkeleton,
} from "@/components/grow/learn/course-card"

type Filter = CatalogFilter | "ALL"

const PAGE = 24

/** Every course the person can learn, searched and filtered by their state on the server, a page at a time. */
export function Catalog() {
  const t = useTranslations("grow.catalogPage")
  const { user } = useAuth()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [filter, setFilter] = useState<Filter>("ALL")
  const [search, setSearch] = useState("")
  const q = useDebounce(search, 300)
  const [courses, setCourses] = useState<LearnerCourse[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manager = isCourseManager(user)
  const filters: { value: Filter; label: string }[] = [
    { value: "ALL", label: t("all") },
    { value: "NOT_STARTED", label: t("notStarted") },
    { value: "IN_PROGRESS", label: t("inProgress") },
    { value: "COMPLETED", label: t("completed") },
  ]

  useEffect(() => {
    setBreadcrumb([{ label: "GROW", href: "/grow" }, { label: t("title") }])
  }, [setBreadcrumb, t])

  const fetchPage = useCallback(
    (after?: string) =>
      growApi.getCatalog({
        q,
        status: filter === "ALL" ? undefined : filter,
        cursor: after,
        limit: PAGE,
      }),
    [q, filter]
  )

  const load = useCallback(async () => {
    try {
      const page = await fetchPage()
      setCourses(page.items)
      setCursor(page.nextCursor)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [fetchPage])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(cursor)
      setCourses((list) => [...(list ?? []), ...page.items])
      setCursor(page.nextCursor)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const isFiltered = filter !== "ALL" || q.trim() !== ""

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchCourses")}
            aria-label={t("searchCourses")}
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={filter}
          onValueChange={(value) => value && setFilter(value as Filter)}
          aria-label={t("filterByProgress")}
          className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
        >
          {filters.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

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
      ) : courses === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {isFiltered ? <SearchIcon /> : <GraduationCapIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {isFiltered ? t("noMatchesTitle") : t("noCoursesTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? t("noMatchesDescription")
                : t("noCoursesDescription")}
            </EmptyDescription>
          </EmptyHeader>
          {!isFiltered && manager && (
            <EmptyContent>
              <Button asChild>
                <Link href="/grow/manage">
                  <PlusIcon data-icon="inline-start" />
                  {t("createCourse")}
                </Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} showRestricted={manager} />
            ))}
          </div>
          {cursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore && <Spinner data-icon="inline-start" />}
                {loadingMore ? t("loading") : t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
