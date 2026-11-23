"use client"

import { useState, useCallback, useMemo } from "react"
import {
  MoreHorizontalIcon,
  PencilIcon,
  ArchiveIcon,
  TrashIcon,
  PlusIcon,
  GlobeIcon,
  BriefcaseIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { orgApi, type Position } from "@/lib/org-api"
import { usePositions } from "@/hooks/use-positions"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage } from "@/lib/api"
import { PageToolbar } from "@/components/layout/page-toolbar"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SortHead } from "@/components/shared/sort-head"
import { TablePagination } from "@/components/shared/table-pagination"
import { useClientPage } from "@/hooks/use-client-page"
import { PositionPanelSkeleton } from "@/components/settings/settings-skeletons"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { PositionDialog } from "@/components/shared/position-dialog"
import { useTranslations } from "next-intl"

type StatusFilter = "ALL" | "ACTIVE" | "ARCHIVED"
type PositionSort = "name" | "area" | "users"

export function PositionPanel() {
  const tc = useTranslations("common")
  const t = useTranslations("settings.positions")
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const { positions, isLoading, refresh } = usePositions(isAdmin)

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Position | null>(null)
  const [pendingArchive, setPendingArchive] = useState<Position | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE")
  const [sort, setSort] = useState<PositionSort>("area")
  const [order, setOrder] = useState<"asc" | "desc">("asc")

  const handleArchive = useCallback(
    async (p: Position) => {
      setBusy(true)
      try {
        await orgApi.archivePosition(p.id)
        toast.success(t("archived"))
        setPendingArchive(null)
        refresh()
      } catch (e) {
        toast.error(getErrorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t]
  )

  const handleDelete = useCallback(
    async (p: Position) => {
      setBusy(true)
      try {
        await orgApi.deletePosition(p.id)
        toast.success(t("deleted"))
        setPendingDelete(null)
        refresh()
      } catch (e) {
        toast.error(getErrorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t]
  )

  // By area the global positions come first, then by name; a click on a header changes the column.
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sign = order === "asc" ? 1 : -1
    return positions
      .filter(
        (p) =>
          (filter === "ALL" || p.isActive === (filter === "ACTIVE")) &&
          (!q ||
            `${p.name} ${p.description ?? ""} ${p.orgNode?.name ?? ""}`
              .toLowerCase()
              .includes(q))
      )
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name)
        if (sort === "name") return sign * byName
        if (sort === "users") {
          return sign * (a._count.profiles - b._count.profiles) || byName
        }
        const areaA = a.orgNode?.name ?? ""
        const areaB = b.orgNode?.name ?? ""
        return sign * areaA.localeCompare(areaB) || byName
      })
  }, [positions, search, filter, sort, order])
  const paged = useClientPage(sorted)
  const rows = paged.rows
  const sortBy = (column: PositionSort) => {
    setSort(column)
    setOrder(sort === column && order === "asc" ? "desc" : "asc")
    paged.setPage(1)
  }
  if (!isAdmin) {
    return (
      <div className="text-sm text-muted-foreground">{t("adminsOnly")}</div>
    )
  }

  const isFiltered = search.trim() !== "" || filter !== "ALL"

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        left={
          <>
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  paged.setPage(1)
                }}
                maxLength={100}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={filter}
              onValueChange={(value) => {
                if (value) {
                  setFilter(value as StatusFilter)
                  paged.setPage(1)
                }
              }}
              aria-label={t("filterByStatus")}
              className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
            >
              <ToggleGroupItem value="ACTIVE">{t("active")}</ToggleGroupItem>
              <ToggleGroupItem value="ARCHIVED">
                {t("archivedBadge")}
              </ToggleGroupItem>
              <ToggleGroupItem value="ALL">{t("all")}</ToggleGroupItem>
            </ToggleGroup>
          </>
        }
        primaryAction={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("new")}
          </Button>
        }
      />

      {isLoading ? (
        <PositionPanelSkeleton />
      ) : positions.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseIcon />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyBody")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : sorted.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>{t("noMatchTitle")}</EmptyTitle>
            <EmptyDescription>{t("noMatchBody")}</EmptyDescription>
          </EmptyHeader>
          {isFiltered && (
            <EmptyContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setFilter("ALL")
                  paged.setPage(1)
                }}
              >
                {t("clearFilters")}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <SortHead
                  sort="name"
                  label={t("name")}
                  active={sort === "name"}
                  order={order}
                  onSort={sortBy}
                />
                <SortHead
                  sort="area"
                  label={t("area")}
                  active={sort === "area"}
                  order={order}
                  onSort={sortBy}
                />
                <SortHead
                  sort="users"
                  label={t("users")}
                  active={sort === "users"}
                  order={order}
                  onSort={sortBy}
                />
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("moreActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <PositionTableRow
                  key={p.id}
                  p={p}
                  busy={busy}
                  onEdit={() => setEditing(p)}
                  onArchive={() => setPendingArchive(p)}
                  onDelete={() => setPendingDelete(p)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {sorted.length > 0 && (
        <TablePagination
          page={paged.page}
          pageSize={paged.pageSize}
          total={paged.total}
          onPageChange={paged.setPage}
          onPageSizeChange={paged.setPageSize}
        />
      )}

      <PositionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refresh}
      />

      <PositionDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        position={editing}
        onSuccess={() => {
          setEditing(null)
          refresh()
        }}
      />

      <AlertDialog
        open={!!pendingArchive}
        onOpenChange={(o) => !o && setPendingArchive(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("archiveBody", { name: pendingArchive?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingArchive && handleArchive(pendingArchive)}
              disabled={busy}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {tc("archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteBody", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
              disabled={busy}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
            >
              {busy && <Spinner data-icon="inline-start" />}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface PositionTableRowProps {
  p: Position
  busy: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}

function PositionTableRow({
  p,
  busy,
  onEdit,
  onArchive,
  onDelete,
}: PositionTableRowProps) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.positions")
  return (
    <TableRow>
      <TableCell className="w-full max-w-0 min-w-48">
        <div className="flex items-center gap-2">
          {p.color ? (
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
          ) : (
            <BriefcaseIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{p.name}</span>
            {p.description && (
              <span className="truncate text-xs text-muted-foreground">
                {p.description}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {p.orgNode ? (
          p.orgNode.name
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <GlobeIcon className="size-3" aria-hidden />
            {t("global")}
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {p._count.profiles}
      </TableCell>
      <TableCell>
        <StatusBadge tone={p.isActive ? "success" : "neutral"}>
          {p.isActive ? t("active") : t("archivedBadge")}
        </StatusBadge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("moreActions")}
              disabled={busy}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit} disabled={!p.isActive}>
              <PencilIcon data-icon="inline-start" />
              {tc("edit")}
            </DropdownMenuItem>
            {p.isActive && (
              <DropdownMenuItem onSelect={onArchive}>
                <ArchiveIcon data-icon="inline-start" />
                {tc("archive")}
              </DropdownMenuItem>
            )}
            {p._count.profiles === 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} variant="destructive">
                  <TrashIcon data-icon="inline-start" />
                  {tc("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
