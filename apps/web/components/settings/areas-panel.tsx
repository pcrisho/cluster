"use client"

import { useState, useCallback, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PlusIcon, MousePointerClickIcon } from "lucide-react"
import { toast } from "sonner"

import { orgApi, type OrgNode } from "@/lib/org-api"
import { useFullOrgChart } from "@/hooks/use-full-org-chart"
import { useIsBelow } from "@/hooks/use-mobile"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { OrgChartTree } from "./org-chart-tree"
import { AreaDetailPanel } from "./area-detail-panel"
import { AreaFormDialog, type AreaFormTarget } from "./area-form-dialog"
import { MainNodesTable } from "./main-nodes-table"
import { usePartitionConfirm } from "./partition-move-dialog"
import { peopleMovingPartition } from "@/lib/partition-moves"
import { PageToolbar } from "@/components/layout/page-toolbar"
import { useTranslations } from "next-intl"

export function AreasPanel() {
  const tc = useTranslations("common")
  const t = useTranslations("settings.areas")
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const isolated = user?.organization.isolated ?? false
  const { ask, dialog } = usePartitionConfirm()
  const { data, isLoading, error, refresh } = useFullOrgChart()
  const stacked = useIsBelow(1536)

  const router = useRouter()
  const pathname = usePathname()
  const view = useSearchParams().get("view") === "main" ? "main" : "tree"
  const setView = (next: "tree" | "main") =>
    router.replace(next === "main" ? `${pathname}?view=main` : pathname, {
      scroll: false,
    })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<AreaFormTarget | null>(null)
  const opens = useRef(0)
  const [busy, setBusy] = useState(false)
  const [pendingArchive, setPendingArchive] = useState<OrgNode | null>(null)
  const [reassignTo, setReassignTo] = useState<string>("")

  const openCreate = useCallback(
    (parentId: string | null = null) =>
      setForm({ key: ++opens.current, editing: null, parentId }),
    []
  )
  const openEdit = useCallback(
    (node: OrgNode) =>
      setForm({ key: ++opens.current, editing: node, parentId: node.parentId }),
    []
  )

  const archive = useCallback(async () => {
    if (!pendingArchive) return
    setBusy(true)
    try {
      await orgApi.archiveArea(pendingArchive.id, reassignTo)
      toast.success(t("archived"))
      setPendingArchive(null)
      setReassignTo("")
      setSelectedId(null)
      refresh()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [pendingArchive, reassignTo, refresh, t])

  const handleArchive = useCallback(() => {
    if (!pendingArchive || !reassignTo) {
      toast.error(t("pickReassign"))
      return
    }
    const change = peopleMovingPartition(
      data?.nodes ?? [],
      { kind: "archive", nodeId: pendingArchive.id, reassignTo },
      isolated
    )
    // The archive dialog gives way to the confirmation when people change main node.
    if (change) setPendingArchive(null)
    ask(change, () => void archive(), "archive")
  }, [archive, ask, data?.nodes, isolated, pendingArchive, reassignTo, t])

  const selected = data?.nodes.find((n) => n.id === selectedId) ?? null
  const detail = selected && data && (
    <AreaDetailPanel
      key={selected.id}
      node={selected}
      nodes={data.nodes}
      isAdmin={isAdmin}
      onClose={stacked ? undefined : () => setSelectedId(null)}
      onEdit={openEdit}
      onAddChild={openCreate}
      onArchive={setPendingArchive}
    />
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <PageToolbar
        left={
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={view}
            onValueChange={(v) => v && setView(v as "tree" | "main")}
            aria-label={t("view")}
          >
            <ToggleGroupItem value="tree">{t("viewTree")}</ToggleGroupItem>
            <ToggleGroupItem value="main">{t("viewMain")}</ToggleGroupItem>
          </ToggleGroup>
        }
        primaryAction={
          <Button onClick={() => openCreate(null)}>
            <PlusIcon data-icon="inline-start" />
            {t("newRoot")}
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        {view === "main" ? (
          <MainNodesTable
            data={data}
            isLoading={isLoading}
            error={error}
            refresh={refresh}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={() => openCreate(null)}
          />
        ) : (
          <OrgChartTree
            data={data}
            isLoading={isLoading}
            error={error}
            onSelect={setSelectedId}
            selectedId={selectedId}
            onAddRoot={() => openCreate(null)}
            onAddChild={openCreate}
            onArchive={setPendingArchive}
            refresh={refresh}
          />
        )}
        {!stacked &&
          (detail ? (
            <div className="h-full min-h-[min(24rem,calc(100dvh-14rem))] overflow-hidden rounded-xl border bg-card">
              {detail}
            </div>
          ) : (
            <Empty className="min-h-[min(24rem,calc(100dvh-14rem))] rounded-xl border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MousePointerClickIcon />
                </EmptyMedia>
                <EmptyTitle>{t("selectTitle")}</EmptyTitle>
                <EmptyDescription>{t("selectHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ))}
      </div>

      {stacked && (
        <Sheet
          open={!!detail}
          onOpenChange={(open) => !open && setSelectedId(null)}
        >
          <SheetContent className="w-full gap-0 sm:max-w-md">
            <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("detailDescription")}
            </SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      )}

      <AreaFormDialog
        target={form}
        nodes={data?.nodes ?? []}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null)
          refresh()
        }}
      />

      <Dialog
        open={!!pendingArchive}
        onOpenChange={(o) => !o && setPendingArchive(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("archiveTitle")}</DialogTitle>
            <DialogDescription>
              {t("archiveBody", { name: pendingArchive?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{t("reassignTo")}</FieldLabel>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pickArea")} />
                </SelectTrigger>
                <SelectContent>
                  {(data?.nodes ?? [])
                    .filter((n) => n.isActive && n.id !== pendingArchive?.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingArchive(null)}
              disabled={busy}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={busy || !reassignTo}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {tc("archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  )
}
