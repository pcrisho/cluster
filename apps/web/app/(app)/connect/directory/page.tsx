"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ReactFlowProvider } from "@xyflow/react"
import {
  GitBranchIcon,
  LayoutGridIcon,
  Table2Icon,
  UsersIcon,
} from "lucide-react"

import { connectApi, type DirectoryUser } from "@/lib/connect-api"
import { getErrorMessage } from "@/lib/api"
import { filtersToApiParams } from "@/lib/directory-filters"
import {
  type DirectoryUrlState,
  type DirectoryView,
  PAGE_SIZES,
  parseDirectoryUrl,
  serializeDirectoryUrl,
} from "@/lib/directory-url"
import { usePositions } from "@/hooks/use-positions"
import { useOrgNodes } from "@/hooks/use-org-nodes"
import { useDebounce } from "@/hooks/use-debounce"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DirectoryEmpty } from "@/components/connect/directory-empty"
import { DirectoryGridCard } from "@/components/connect/directory-grid-card"
import { DirectorySkeleton } from "@/components/connect/directory-skeleton"
import {
  DirectoryTable,
  type DirectoryColumns,
} from "@/components/connect/directory-table"
import { DirectoryToolbar } from "@/components/connect/directory-toolbar"
import { OrgChartCanvas } from "@/components/connect/org-chart-canvas"
import { TablePagination } from "@/components/shared/table-pagination"

export default function DirectoryPage() {
  const tc = useTranslations("common")
  const t = useTranslations("connect.directory")
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  // The URL is the state: view, search, filters, sort and page survive a reload and the back button.
  const state = useMemo(
    () => parseDirectoryUrl(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )
  const { view, filters, sort, page, pageSize } = state

  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [columns, setColumns] = useState<DirectoryColumns>({})

  const { positions } = usePositions()
  const {
    nodes: orgNodes,
    isLoading: isLoadingOrg,
    error: orgError,
    refresh: refreshOrg,
  } = useOrgNodes()

  const update = useCallback(
    (patch: Partial<DirectoryUrlState>) => {
      // Any change but the page itself goes back to page 1.
      const next = { ...state, page: 1, ...patch }
      const query = serializeDirectoryUrl(next).toString()
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      })
    },
    [pathname, router, state]
  )

  const [search, setSearch] = useState(state.search)
  // Adopt a search that arrives through the URL (back button, a shared link).
  const [urlSearch, setUrlSearch] = useState(state.search)
  if (state.search !== urlSearch) {
    setUrlSearch(state.search)
    setSearch(state.search)
  }
  const debouncedSearch = useDebounce(search, 300)
  // Only a settled input writes the URL: a stale debounced value would put back a cleared search.
  useEffect(() => {
    if (debouncedSearch === search && debouncedSearch !== state.search)
      update({ search: debouncedSearch })
  }, [debouncedSearch, search, state.search, update])

  const fetchDirectory = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = filtersToApiParams(
        filters,
        state.search || undefined,
        page,
        sort
      )
      params.limit = pageSize
      const result = await connectApi.getDirectory(params)
      setUsers(result.data)
      setTotal(result.meta.total)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [filters, state.search, page, sort, pageSize])

  useEffect(() => {
    if (view === "tree") return
    queueMicrotask(() => {
      void fetchDirectory()
    })
  }, [fetchDirectory, view])

  const hasFilters = filters.some((f) => f.values.length > 0)
  const isTree = view === "tree"

  const count = isTree
    ? t("areas", { count: orgNodes.length })
    : t("members", { count: total })

  return (
    <PageContainer width="full" className={isTree ? "flex-1" : undefined}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {!(isTree ? isLoadingOrg : isLoading) && !error && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(val) => {
                if (val) update({ view: val as DirectoryView, page: 1 })
              }}
              variant="outline"
              spacing={0}
            >
              <ToggleGroupItem value="table" aria-label={t("tableView")}>
                <Table2Icon />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label={t("gridView")}>
                <LayoutGridIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="tree" aria-label={t("treeView")}>
                <GitBranchIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        }
      />

      {!isTree && (
        <DirectoryToolbar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={(next) => update({ filters: next })}
          orgNodes={orgNodes}
          positions={positions}
          columns={view === "table" ? columns : undefined}
          onColumnsChange={setColumns}
        />
      )}

      {isTree ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ReactFlowProvider>
            <OrgChartCanvas
              nodes={orgNodes}
              isLoading={isLoadingOrg}
              error={orgError}
              onRetry={refreshOrg}
            />
          </ReactFlowProvider>
        </div>
      ) : isLoading ? (
        <DirectorySkeleton viewMode={view === "grid" ? "grid" : "table"} />
      ) : error ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{t("loadFailed")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void fetchDirectory()}>
            {tc("retry")}
          </Button>
        </Empty>
      ) : users.length === 0 ? (
        <DirectoryEmpty
          hasSearch={hasFilters || !!state.search}
          searchTerm={state.search}
          hasFilters={hasFilters}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {view === "table" ? (
            <DirectoryTable
              users={users}
              sort={sort}
              onSortChange={(next) => update({ sort: next })}
              columns={columns}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {users.map((u) => (
                <DirectoryGridCard key={u.id} user={u} />
              ))}
            </div>
          )}
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            pageSizes={[...PAGE_SIZES]}
            onPageChange={(next) => update({ page: next })}
            onPageSizeChange={(size) => update({ pageSize: size })}
          />
        </div>
      )}
    </PageContainer>
  )
}
