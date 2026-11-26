"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"

import type { Member } from "@/lib/admin-api"
import { orgApi } from "@/lib/org-api"
import { useHoverExpand } from "@/hooks/use-hover-expand"
import { getErrorMessage } from "@/lib/api"
import { UNASSIGNED, resolveAssignment } from "@/lib/assignment-drop"
import { createDragStore, useDragSelector } from "@/lib/drag-store"
import { peopleMovingPartition, type FlatArea } from "@/lib/partition-moves"
import type { AskPartition } from "@/components/settings/partition-move-dialog"
import { usePointerY } from "@/hooks/use-pointer-y"
import {
  dragY,
  rowAt,
  treeKeyboardCoordinates,
  type RowBox,
} from "@/lib/tree-dnd"
import type { AssignDragState } from "@/components/settings/assignment-tree-rows"
import { useTranslations } from "next-intl"

// Module constants on purpose: new option objects make dnd-kit rebuild its activators and re-render every handle.
const POINTER = { activationConstraint: { distance: 5 } }
const KEYBOARD = { coordinateGetter: treeKeyboardCoordinates }
const noCollisions = () => []

const IDLE: AssignDragState = {
  activeId: null,
  overId: null,
  resolution: null,
  landedId: null,
}

/** What a person looks like to the tree: the API's member, plus the move not yet confirmed. */
interface Override {
  orgNodeId: string | null
  position: { id: string; name: string } | null
}

interface Params {
  fetched: Member[]
  areaName: Map<string, string>
  /** The area a position belongs to; null means it is global. */
  positionArea: (positionId: string) => string | null
  expanded: Set<string>
  openNode: (id: string) => void
  /** Whether a closed area has anything to show once opened. */
  canOpen: (areaId: string) => boolean
  refreshUsers: () => Promise<unknown>
  refreshChart: () => Promise<unknown>
  /** The areas of the org chart, for the main-node check of a move. */
  nodes: FlatArea[]
  isolated: boolean
  ask: AskPartition
}

/**
 * Dragging a person onto an area (or onto "Unassigned"). The move shows at once through `users`;
 * the rows follow the drag through `store` so a pointer move re-renders only what changed.
 */
export function useAssignmentDrag({
  fetched,
  areaName,
  positionArea,
  expanded,
  openNode,
  canOpen,
  refreshUsers,
  refreshChart,
  nodes,
  isolated,
  ask,
}: Params) {
  const t = useTranslations("settings.assignment")
  // A move shows at once; the server's answer replaces it.
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map())

  const users = useMemo(
    () =>
      overrides.size === 0
        ? fetched
        : fetched.map((u) => {
            const o = overrides.get(u.id)
            return o && u.profile
              ? {
                  ...u,
                  profile: {
                    ...u.profile,
                    orgNode: o.orgNodeId ? { id: o.orgNodeId, name: "" } : null,
                    position: o.position,
                  },
                }
              : u
          }),
    [fetched, overrides]
  )

  const [store] = useState(() => createDragStore<AssignDragState>(IDLE))
  const [live, setLive] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<RowBox[]>([])
  const originRef = useRef<number | null>(null)
  const landedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(landedTimer.current), [])
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER),
    useSensor(KeyboardSensor, KEYBOARD)
  )

  /** Rows that count as a drop on an area, by their place from the top of the list, read once per layout change. */
  const measureRows = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const base = list.getBoundingClientRect().top - list.scrollTop
    originRef.current = base
    rowsRef.current = Array.from(
      list.querySelectorAll<HTMLElement>("[data-drop-area]")
    ).map((el) => {
      const box = el.getBoundingClientRect()
      return {
        id: el.dataset.dropArea!,
        top: box.top - base,
        height: box.height,
      }
    })
  }, [])
  const grabbing = useDragSelector(store, (d) => d.activeId !== null)
  const pointerY = usePointerY(grabbing)
  useEffect(() => {
    if (grabbing) measureRows()
  }, [grabbing, expanded, measureRows])
  useEffect(() => {
    if (!grabbing) return
    const stale = () => {
      originRef.current = null
    }
    window.addEventListener("scroll", stale, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", stale, { capture: true })
  }, [grabbing])
  useEffect(() => {
    if (!grabbing) return
    document.body.style.userSelect = "none" // dragging over rows must not select their text
    document.body.style.cursor = "grabbing"
    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [grabbing])

  const drag = useDragSelector(store, (d) => d)
  const nameOf = (id: string | null) =>
    id === null || id === UNASSIGNED ? "" : (areaName.get(id) ?? "")
  const hint = (overId: string | null, res: AssignDragState["resolution"]) => {
    if (!overId || res?.kind !== "ok") return undefined
    const move =
      res.plan.orgNodeId === null
        ? t("dnd.unassign")
        : t("dnd.moveTo", { area: nameOf(res.plan.orgNodeId) })
    return res.plan.clearedPosition
      ? `${move} · ${t("dnd.clears", { position: res.plan.clearedPosition.name })}`
      : move
  }

  // A closed area opens while a person hovers over it.
  const hovered =
    drag.overId &&
    drag.overId !== UNASSIGNED &&
    !expanded.has(drag.overId) &&
    canOpen(drag.overId)
      ? drag.overId
      : null
  useHoverExpand(hovered, openNode)

  const personOf = (id: string) => users.find((u) => u.id === id)
  const onDragStart = ({ active }: DragStartEvent) => {
    measureRows()
    store.set({
      ...store.get(),
      activeId: String(active.id),
      overId: null,
      resolution: null,
    })
    const u = personOf(String(active.id))
    setLive(t("dnd.picked", { name: u ? `${u.firstName} ${u.lastName}` : "" }))
  }

  const onDragMove = (event: DragMoveEvent) => {
    const list = listRef.current
    const y = dragY(event, pointerY.current)
    if (!list || y === null) return
    originRef.current ??= list.getBoundingClientRect().top - list.scrollTop
    const row = rowAt(rowsRef.current, y - originRef.current)
    const current = store.get()
    // Between two rows keep the last area; leave it only when the pointer is off the list.
    if (!row) {
      if (
        current.overId &&
        (y < list.getBoundingClientRect().top ||
          y > list.getBoundingClientRect().bottom)
      )
        store.set({ ...current, overId: null, resolution: null })
      return
    }
    if (current.overId === row.id) return
    const person = personOf(String(event.active.id))
    if (!person) return
    const resolution = resolveAssignment(
      {
        orgNodeId: person.profile?.orgNode?.id ?? null,
        position: person.profile?.position ?? null,
      },
      row.id === UNASSIGNED ? null : row.id,
      positionArea
    )
    store.set({ ...current, overId: row.id, resolution })
    setLive(hint(row.id, resolution) ?? "")
  }

  const finish = () => {
    store.set({
      ...store.get(),
      activeId: null,
      overId: null,
      resolution: null,
    })
    setLive("")
  }

  const land = (id: string) => {
    store.set({ ...store.get(), landedId: id })
    clearTimeout(landedTimer.current)
    landedTimer.current = setTimeout(
      () => store.set({ ...store.get(), landedId: null }),
      1100
    )
  }

  const settle = (userId: string) =>
    Promise.all([refreshUsers(), refreshChart()]).finally(() =>
      setOverrides((m) => {
        const next = new Map(m)
        next.delete(userId)
        return next
      })
    )

  const onDragEnd = async ({ active }: DragEndEvent) => {
    const { resolution } = store.get()
    finish()
    if (resolution?.kind !== "ok") return
    const userId = String(active.id)
    const person = personOf(userId)
    if (!person?.profile) return
    const { plan } = resolution
    const name = `${person.firstName} ${person.lastName}`
    const before = {
      orgNodeId: person.profile.orgNode?.id ?? null,
      positionId: person.profile.position?.id ?? null,
    }
    const apply = async () => {
      setOverrides((m) =>
        new Map(m).set(userId, {
          orgNodeId: plan.orgNodeId,
          position: plan.clearedPosition ? null : person.profile!.position,
        })
      )
      if (plan.orgNodeId) openNode(plan.orgNodeId)
      land(userId)
      try {
        await orgApi.setAssignment(
          userId,
          plan.clearedPosition || plan.orgNodeId === null
            ? { orgNodeId: plan.orgNodeId, positionId: null }
            : { orgNodeId: plan.orgNodeId }
        )
      } catch (e) {
        setOverrides((m) => {
          const next = new Map(m)
          next.delete(userId)
          return next
        })
        toast.error(getErrorMessage(e))
        return
      }
      void settle(userId)
      const params = {
        name,
        area: nameOf(plan.orgNodeId),
        position: plan.clearedPosition?.name ?? "",
      }
      const message = plan.orgNodeId
        ? t(plan.clearedPosition ? "dnd.movedClearing" : "dnd.moved", params)
        : t(
            plan.clearedPosition ? "dnd.removedClearing" : "dnd.removed",
            params
          )
      setLive(message)
      toast.success(message, {
        action: {
          label: t("dnd.undo"),
          onClick: async () => {
            try {
              await orgApi.setAssignment(userId, before)
              await Promise.all([refreshUsers(), refreshChart()])
              land(userId)
              toast.success(t("dnd.undone"))
            } catch (e) {
              toast.error(getErrorMessage(e))
            }
          },
        },
      })
    }
    // Asked after the drop and before anything is sent: cancel leaves the people as they were.
    const change = peopleMovingPartition(
      nodes,
      {
        kind: "person",
        fromNodeId: before.orgNodeId,
        toNodeId: plan.orgNodeId,
      },
      isolated
    )
    ask(change, () => void apply())
  }

  const held = drag.activeId ? personOf(drag.activeId) : null

  return {
    users,
    store,
    drag,
    live,
    listRef,
    held,
    hint,
    dndProps: {
      sensors,
      collisionDetection: noCollisions,
      onDragStart,
      onDragMove,
      onDragEnd,
      onDragCancel: () => {
        finish()
        setLive(t("dnd.cancelled"))
      },
      accessibility: {
        screenReaderInstructions: { draggable: t("dnd.instructions") },
        announcements: {
          onDragStart: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
      },
    },
  }
}
