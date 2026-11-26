"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  SearchIcon,
  FileTextIcon,
  ArrowLeftIcon,
} from "lucide-react"

import { knowApi, type SearchResult, type Space } from "@/lib/know-api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select"
import { SearchResultsSkeleton } from "@/components/know/know-skeleton"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

export default function SearchPage() {
  const tc = useTranslations("common")
  const t = useTranslations("know.search")
  const dates = useDates()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryParam = searchParams.get("q") || ""
  const spaceFilterParam = searchParams.get("spaceId") || "all"

  const [query, setQuery] = useState(queryParam)
  const [results, setResults] = useState<SearchResult[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceFilter, setSpaceFilter] = useState(spaceFilterParam)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const { setItems: setBreadcrumb } = useBreadcrumb()

  useEffect(() => {
    setBreadcrumb([{ label: "Know", href: "/know" }, { label: t("crumb") }])
  }, [setBreadcrumb, t])

  useEffect(() => {
    knowApi.getSpaces().then((r) => setSpaces(r.data))
  }, [])

  const performSearch = useCallback(async (q: string, spaceId?: string) => {
    if (!q.trim()) {
      setResults([])
      setHasSearched(false)
      return
    }
    setIsLoading(true)
    setHasSearched(true)
    try {
      const result = await knowApi.search(
        q.trim(),
        spaceId && spaceId !== "all" ? spaceId : undefined
      )
      setResults(result.data)
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (queryParam) {
      Promise.resolve().then(() =>
        performSearch(
          queryParam,
          spaceFilterParam !== "all" ? spaceFilterParam : undefined
        )
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (spaceFilter !== "all") params.set("spaceId", spaceFilter)
    router.push(`/know/search?${params}`)
    performSearch(query.trim(), spaceFilter !== "all" ? spaceFilter : undefined)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/know")}
          aria-label={t("back")}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            placeholder={t("placeholder")}
            className="bg-background/50 pl-9 focus:bg-background"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={spaceFilter} onValueChange={setSpaceFilter}>
          <SelectTrigger className="w-[180px] bg-background/50">
            <SelectValue placeholder={t("allSpaces")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("allSpaces")}</SelectItem>
              {spaces.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit">{t("submit")}</Button>
      </form>

      <Separator />

      {isLoading ? (
        <SearchResultsSkeleton />
      ) : hasSearched && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="rounded-full bg-muted p-4">
            <SearchIcon className="size-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium">{t("noResults")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noResultsHint", { query })}
            </p>
          </div>
        </div>
      ) : !hasSearched ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="rounded-full bg-muted p-4">
            <SearchIcon className="size-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium">{t("startTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("startHint")}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("count", { count: results.length, query })}
          </p>
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/know/spaces/${result.space.id}/${result.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start gap-3">
                <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground hover:text-primary">
                    {result.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">
                      {result.space.name}
                    </Badge>
                    <span>
                      {result.author.firstName} {result.author.lastName}
                    </span>
                    <span>&middot;</span>
                    <span>{tc("version", { version: result._count.versions })}</span>
                    <span>&middot;</span>
                    <span>
                      {dates.instant(result.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
