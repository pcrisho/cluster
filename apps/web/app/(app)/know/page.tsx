"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpenIcon, PlusIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { knowApi, type Space } from "@/lib/know-api"
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
import { CreateSpaceDialog } from "@/components/know/create-space-dialog"
import { SpacesGridSkeleton } from "@/components/know/know-skeleton"
import { SpaceCard } from "@/components/know/space-card"
import { useTranslations } from "next-intl"

export default function KnowDashboard() {
  const t = useTranslations("know.home")
  const { user } = useAuth()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)

  const canCreate =
    user?.role === "ADMIN" || !!user?.capabilities.includes("KNOW_SPACE_CREATE")

  useEffect(() => {
    setBreadcrumb([{ label: "Know", href: "/know" }, { label: t("spaces") }])
  }, [setBreadcrumb, t])

  const fetchSpaces = useCallback(async () => {
    try {
      const result = await knowApi.getSpaces(debouncedSearch || undefined)
      setSpaces(result.data)
      setError(null)
    } catch {
      setError(t("loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, t])

  useEffect(() => {
    Promise.resolve().then(fetchSpaces)
  }, [fetchSpaces])

  const newSpace = (label: string) =>
    canCreate && (
      <CreateSpaceDialog>
        <Button>
          <PlusIcon data-icon="inline-start" />
          {label}
        </Button>
      </CreateSpaceDialog>
    )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {newSpace(t("newSpace"))}
      </header>

      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </InputGroup>

      {isLoading ? (
        <SpacesGridSkeleton />
      ) : error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t("error")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={fetchSpaces}>
              {t("tryAgain")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : spaces.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {debouncedSearch ? <SearchIcon /> : <BookOpenIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {debouncedSearch ? t("noneFound") : t("noneYet")}
            </EmptyTitle>
            <EmptyDescription>
              {debouncedSearch
                ? t("nothingMatches", { query: debouncedSearch })
                : canCreate
                  ? t("createFirstHint")
                  : t("noneShared")}
            </EmptyDescription>
          </EmptyHeader>
          {!debouncedSearch && (
            <EmptyContent>{newSpace(t("createFirst"))}</EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <SpaceCard key={space.id} space={space} />
          ))}
        </div>
      )}
    </div>
  )
}
