"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { NetworkIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { orgApi } from "@/lib/org-api"
import type { FullOrgChartData } from "@/hooks/use-full-org-chart"
import { useHoverExpand } from "@/hooks/use-hover-expand"
import { usePointerY } from "@/hooks/use-pointer-y"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage } from "@/lib/api"
import {
  MAX_AREA_DEPTH,
  applyPlacement,
  byOrder,
  indexAreas,
  placementOf,
  resolveDrop,
  type Placement,
  type Resolution,
} from "@/lib/area-drop"
import { createDragStore, useDragSelector } from "@/lib/drag-store"
import { peopleMovingPartition } from "@/lib/partition-moves"
import { usePartitionConfirm } from "@/components/settings/partition-move-dialog"
import {
  dragY,
  rowAt,
  treeKeyboardCoordinates,
  zoneOf,
  type RowBox,
} from "@/lib/tree-dnd"
import { OrgNodeIcon } from "@/components/shared/org-node-icon"
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
import { Skeleton } from "@/components/ui/skeleton"
import { DragChip } from "./drag-chip"
import { AreaTreeRow, type DragState, type TreeNode } from "./area-tree-row"
import { useTranslations } from "next-intl"

export type { TreeNode }

function buildTree(flat: FullOrgChartData["nodes"]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const n of flat) map.set(n.id, { ...n, children: [] })
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(item)
    }
  }
  const roots = Array.from(map.values()).filter((n) => !n.parentId)
  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort(byOrder)
    for (const n of nodes) sortRecursive(n.children)
  }
  sortRecursive(roots)
  return roots
}

const IDLE: DragState = {
  activeId: null,
  overId: null,
  zone: null,
  resolution: null,
  landedId: null,
}

// Module constants on purpose: new option objects make dnd-kit rebuild its activators and re-render every handle.
const POINTER = { activationConstraint: { distance: 5 } }
const KEYBOARD = { coordinateGetter: treeKeyboardCoordinates }

/** No droppables: the rows are found by position (`rowAt`), so a pointer move never re-renders them. */
const noCollisions = () => []

interface OrgChartTreeProps {
  data: FullOrgChartData | null
  isLoading: boolean
  error: string | null
  onSelect: (id: string) => void
  selectedId: string | null
  onAddRoot: () => void
  onAddChild: (parentId: string) => void
  onArchive: (node: TreeNode) => void
  refresh: () => Promise<void>
}

export function OrgChartTree({
  data,
  isLoading,
  error,
  onSelect,
  selectedId,
  onAddRoot,
  onAddChild,
  onArchive,
  refresh,
}: OrgChartTreeProps) {
  const t = useTranslations("settings.areaTree")
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const isolated = user?.organization.isolated ?? false
  const { ask, dialog } = usePartitionConfirm()

  // The move shows at once; the server's answer replaces it.
  const [pending, setPending] = useState<FullOrgChartData["nodes"] | null>(null)
  const nodes = useMemo(() => pending ?? data?.nodes ?? [], [pending, data])
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const index = useMemo(() => indexAreas(nodes), [nodes])
  // Until the user toggles something, the root areas are open.
  const [toggled, setExpanded] = useState<Set<string> | null>(null)
  const expanded = useMemo(
    () => toggled ?? new Set(tree.map((n) => n.id)),
    [toggled, tree]
  )
  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  })

  const [store] = useState(() => createDragStore<DragState>(IDLE))
  const [live, setLive] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<RowBox[]>([])
  /** Top of the list's content on screen; read again only when something scrolls, not on every move. */
  const originRef = useRef<number | null>(null)
  const landedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(landedTimer.current), [])

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER),
    useSensor(KeyboardSensor, KEYBOARD)
  )

  const toggleExpand = useCallback((id: string) => {
    const next = new Set(expandedRef.current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }, [])
  const open = useCallback((id: string) => {
    setExpanded(new Set(expandedRef.current).add(id))
  }, [])

  /** Rows by their place from the top of the list's content, read once per layout change instead of per move. */
  const measureRows = useCallback(() => {
    const list = containerRef.current
    if (!list) return
    const base = list.getBoundingClientRect().top - list.scrollTop
    originRef.current = base
    rowsRef.current = Array.from(
      list.querySelectorAll<HTMLElement>("[data-area-id]")
    ).map((el) => {
      const box = el.getBoundingClientRect()
      return { id: el.dataset.areaId!, top: box.top - base, height: box.height }
    })
  }, [])
  useEffect(() => {
    if (store.get().activeId) measureRows()
  }, [expanded, measureRows, store])
  const grabbingRows = useDragSelector(store, (d) => d.activeId !== null)
  const pointerY = usePointerY(grabbingRows)
  useEffect(() => {
    if (!grabbingRows) return
    // The list or the page scrolling (auto-scroll included) moves the origin.
    const stale = () => {
      originRef.current = null
    }
    window.addEventListener("scroll", stale, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", stale, { capture: true })
  }, [grabbingRows])

  const placeText = useCallback(
    (res: Resolution | null, overId: string | null) => {
      if (!res || !overId || res.kind === "same") return undefined
      if (res.kind === "refused")
        return t(`refused.${res.reason}`, { max: MAX_AREA_DEPTH })
      return t(`place.${res.zone}`, {
        name: index.byId.get(overId)?.name ?? "",
      })
    },
    [index, t]
  )

  const drag = useDragSelector(store, (d) => d)
  // A closed branch opens when the drop would go inside it and the pointer stays.
  const hovered =
    drag.resolution?.kind === "ok" &&
    drag.resolution.zone === "inside" &&
    drag.overId &&
    !expanded.has(drag.overId) &&
    index.children.has(drag.overId)
      ? drag.overId
      : null
  useHoverExpand(hovered, open)

  const grabbing = drag.activeId !== null
  const refusing = drag.resolution?.kind === "refused"
  useEffect(() => {
    if (!grabbing) return
    document.body.style.userSelect = "none" // dragging over rows must not select their text
    document.body.style.cursor = refusing ? "not-allowed" : "grabbing"
    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [grabbing, refusing])

  const announce = (text: string | undefined) => setLive(text ?? "")

  const onDragStart = ({ active }: DragStartEvent) => {
    measureRows()
    store.set({
      ...store.get(),
      activeId: String(active.id),
      overId: null,
      zone: null,
      resolution: null,
    })
    announce(
      t("dnd.picked", { name: index.byId.get(String(active.id))?.name ?? "" })
    )
  }

  const onDragMove = (event: DragMoveEvent) => {
    const list = containerRef.current
    const y = dragY(event, pointerY.current)
    if (!list || y === null) return
    const current = store.get()
    // Every move lands here: stay cheap until the row or the zone changes.
    originRef.current ??= list.getBoundingClientRect().top - list.scrollTop
    const at = y - originRef.current
    const row = rowAt(rowsRef.current, at)
    if (!row) {
      if (current.overId)
        store.set({ ...current, overId: null, zone: null, resolution: null })
      return
    }
    const zone = zoneOf(at, row)
    if (current.overId === row.id && current.zone === zone) return
    const resolution = resolveDrop(
      index,
      String(event.active.id),
      row.id,
      zone,
      (id) => expandedRef.current.has(id)
    )
    store.set({ ...current, overId: row.id, zone, resolution })
    announce(placeText(resolution, row.id))
  }

  const finish = () => {
    store.set({
      ...store.get(),
      activeId: null,
      overId: null,
      zone: null,
      resolution: null,
    })
    announce(undefined)
  }

  const land = (id: string) => {
    store.set({ ...store.get(), landedId: id })
    clearTimeout(landedTimer.current)
    landedTimer.current = setTimeout(
      () => store.set({ ...store.get(), landedId: null }),
      1100
    )
  }

  const move = async (id: string, placement: Placement, optimistic = true) => {
    if (optimistic) setPending(applyPlacement(nodes, id, placement))
    try {
      await orgApi.moveArea(id, {
        newParentId: placement.parentId,
        beforeId: placement.beforeId,
      })
    } catch (e) {
      setPending(null)
      toast.error(getErrorMessage(e))
      return false
    }
    // The server's copy replaces the local one in the background.
    void refresh().finally(() => setPending(null))
    return true
  }

  const onDragEnd = async ({ active }: DragEndEvent) => {
    const { resolution, overId } = store.get()
    finish()
    if (!resolution || resolution.kind === "same") return
    const id = String(active.id)
    if (resolution.kind === "refused") {
      toast.error(placeText(resolution, overId) ?? "")
      return
    }
    const { placement } = resolution
    const previous = placementOf(index, id)
    const name = index.byId.get(id)?.name ?? ""
    const place = placeText(resolution, overId) ?? ""
    const apply = async () => {
      if (placement.parentId) open(placement.parentId)
      land(id)
      if (!(await move(id, placement))) return
      announce(t("dnd.moved", { name, place }))
      toast.success(t("dnd.moved", { name, place }), {
        action: {
          label: t("dnd.undo"),
          onClick: async () => {
            if (await move(id, previous, false)) {
              land(id)
              toast.success(t("dnd.undone"))
            }
          },
        },
      })
    }
    // Asked after the drop and before anything is sent: cancel leaves the tree as it was.
    const change = peopleMovingPartition(
      nodes,
      { kind: "area", nodeId: id, newParentId: placement.parentId },
      isolated
    )
    ask(change, () => void apply())
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
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

  if (tree.length === 0) {
    return (
      <Empty className="rounded-lg border border-dashed py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NetworkIcon />
          </EmptyMedia>
          <EmptyTitle>{t("empty")}</EmptyTitle>
          <EmptyDescription>{t("emptyBody")}</EmptyDescription>
        </EmptyHeader>
        {isAdmin && (
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={onAddRoot}>
              <PlusIcon data-icon="inline-start" />
              {t("createFirst")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    )
  }

  const held = drag.activeId ? index.byId.get(drag.activeId) : null

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={noCollisions}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          finish()
          announce(t("dnd.cancelled"))
        }}
        accessibility={{
          screenReaderInstructions: { draggable: t("dnd.instructions") },
          announcements: {
            onDragStart: () => undefined,
            onDragOver: () => undefined,
            onDragEnd: () => undefined,
            onDragCancel: () => undefined,
          },
        }}
      >
        <div
          ref={containerRef}
          className="h-full overflow-y-auto rounded-lg border p-2"
        >
          {tree.map((node) => (
            <AreaTreeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              selectedId={selectedId}
              onAddChild={onAddChild}
              onArchive={onArchive}
              isAdmin={isAdmin}
              store={store}
            />
          ))}
        </div>
        {/* The move is already on screen, so the chip just goes: no flight back to where it started. */}
        <DragOverlay dropAnimation={null}>
          {held && (
            <DragChip
              invalid={drag.resolution?.kind === "refused"}
              icon={
                <OrgNodeIcon
                  name={held.icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
              }
              title={held.name}
              hint={placeText(drag.resolution, drag.overId)}
            />
          )}
        </DragOverlay>
      </DndContext>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {dialog}
    </div>
  )
}
