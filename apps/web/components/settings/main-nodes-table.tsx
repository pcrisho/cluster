"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronRightIcon,
  NetworkIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import type { FullOrgChartData } from "@/lib/org-api"
import {
  filterRootRows,
  rootNodeRows,
  sortRootRows,
  type KindFilter,
  type MainNodeComplianceSummary,
  type RootNodeRow,
  type RootSort,
} from "@/lib/root-node-rows"
import { cn } from "@/lib/utils"
import { OrgNodeIcon } from "@/components/shared/org-node-icon"
import { PersonAvatar } from "@/components/settings/area-detail-panel"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface MainNodesTableProps {
  data: FullOrgChartData | null
  isLoading: boolean
  error: string | null
  refresh: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  showCompliance?: boolean
  complianceByNode?: ReadonlyMap<string, MainNodeComplianceSummary> | null
  complianceLoading?: boolean
}

function KindBadge({ external }: { external: boolean }) {
  const t = useTranslations("settings.areas")
  return (
    <StatusBadge tone={external ? "info" : "neutral"}>
      {external ? t("external") : t("internal")}
    </StatusBadge>
  )
}

/** The organization's main nodes (areas with no parent) as a table, a compact list below `lg`. */
export function MainNodesTable({
  data,
  isLoading,
  error,
  refresh,
  selectedId,
  onSelect,
  onCreate,
  showCompliance = false,
  complianceByNode = null,
  complianceLoading = false,
}: MainNodesTableProps) {
  const t = useTranslations("settings.mainNodes")
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<KindFilter>("all")
  const [sort, setSort] = useState<RootSort>("name")
  const effectiveSort = !showCompliance && sort === "compliance" ? "name" : sort

  const all = useMemo(
    () => rootNodeRows(data?.nodes ?? [], complianceByNode),
    [data?.nodes, complianceByNode]
  )
  const rows = useMemo(
    () => sortRootRows(filterRootRows(all, { query, kind }), effectiveSort),
    [all, query, kind, effectiveSort]
  )

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="danger">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          {error}
          <Button size="sm" variant="outline" onClick={refresh}>
            {t("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (all.length === 0) {
    return (
      <Empty className="rounded-lg border border-dashed py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NetworkIcon />
          </EmptyMedia>
          <EmptyTitle>{t("empty")}</EmptyTitle>
          <EmptyDescription>{t("emptyBody")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onCreate}>
            <PlusIcon data-icon="inline-start" />
            {t("createFirst")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="@container flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InputGroup className="w-full sm:max-w-64 sm:min-w-40 sm:flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={kind}
          onValueChange={(v) => v && setKind(v as KindFilter)}
          aria-label={t("filterByKind")}
          className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
        >
          <ToggleGroupItem value="all">{t("all")}</ToggleGroupItem>
          <ToggleGroupItem value="internal">{t("internal")}</ToggleGroupItem>
          <ToggleGroupItem value="external">{t("external")}</ToggleGroupItem>
        </ToggleGroup>
        <Select
          value={effectiveSort}
          onValueChange={(v) => setSort(v as RootSort)}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:ml-auto sm:w-44"
            aria-label={t("sortBy")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("sortName")}</SelectItem>
            <SelectItem value="people">{t("sortPeople")}</SelectItem>
            {showCompliance && (
              <SelectItem value="compliance">{t("sortCompliance")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noMatch")}
        </p>
      ) : (
        <>
          <div className="hidden max-h-[calc(100svh-19rem)] min-h-40 overflow-auto rounded-lg border lg:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("kind")}</TableHead>
                  <TableHead className="hidden @2xl:table-cell">
                    {t("manager")}
                  </TableHead>
                  <TableHead className="text-right">{t("people")}</TableHead>
                  <TableHead className="text-right">{t("areas")}</TableHead>
                  {showCompliance && (
                    <TableHead className="text-right">
                      {t("compliance")}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <MainNodeTableRow
                    key={row.node.id}
                    row={row}
                    selected={row.node.id === selectedId}
                    onSelect={onSelect}
                    showCompliance={showCompliance}
                    complianceLoading={complianceLoading && !complianceByNode}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y overflow-hidden rounded-lg border lg:hidden">
            {rows.map(({ node, people, compliance }) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  aria-current={node.id === selectedId || undefined}
                  className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 aria-[current]:bg-muted"
                >
                  <OrgNodeIcon
                    name={node.icon}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {node.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        node.code,
                        t("peopleCount", { count: people }),
                        showCompliance && compliance && compliance.rate !== null
                          ? `${compliance.rate}% (${compliance.completed}/${compliance.total})`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {node.external && <KindBadge external />}
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function MainNodeTableRow({
  row: { node, people, areas, compliance },
  selected,
  onSelect,
  showCompliance,
  complianceLoading,
}: {
  row: RootNodeRow
  selected: boolean
  onSelect: (id: string) => void
  showCompliance: boolean
  complianceLoading: boolean
}) {
  const t = useTranslations("settings.mainNodes")
  return (
    <TableRow
      className="relative"
      data-state={selected ? "selected" : undefined}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <OrgNodeIcon
            name={node.icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
          {/* Stretched button: the whole row opens the detail with one tab stop. */}
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            aria-current={selected || undefined}
            className="min-w-0 truncate text-left font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
          >
            {node.name}
          </button>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {node.code ?? <span className="text-muted-foreground">&mdash;</span>}
      </TableCell>
      <TableCell>
        <KindBadge external={node.external} />
      </TableCell>
      <TableCell className="hidden @2xl:table-cell">
        {node.manager ? (
          <span className="flex items-center gap-2">
            <PersonAvatar
              firstName={node.manager.firstName}
              lastName={node.manager.lastName}
              avatarUrl={node.manager.avatarUrl}
            />
            <span className="truncate">
              {node.manager.firstName} {node.manager.lastName}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("noManager")}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{people}</TableCell>
      <TableCell className="text-right tabular-nums">{areas}</TableCell>
      {showCompliance && (
        <TableCell className="text-right">
          {complianceLoading ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : !compliance || compliance.rate === null ? (
            <span className="text-muted-foreground">&mdash;</span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/grow/reports?orgNodeId=${node.id}`}
                  className="relative z-10 inline-flex items-baseline justify-end gap-1.5 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      compliance.rate === 100
                        ? "text-success-text"
                        : compliance.overdue > 0
                          ? "text-danger-text"
                          : "text-foreground"
                    )}
                  >
                    {compliance.rate}%
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {compliance.completed}/{compliance.total}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                {compliance.overdue > 0
                  ? t("complianceTooltipOverdue", {
                      completed: compliance.completed,
                      total: compliance.total,
                      overdue: compliance.overdue,
                    })
                  : t("complianceTooltip", {
                      completed: compliance.completed,
                      total: compliance.total,
                    })}{" "}
                · {t("viewReport")}
              </TooltipContent>
            </Tooltip>
          )}
        </TableCell>
      )}
    </TableRow>
  )
}
