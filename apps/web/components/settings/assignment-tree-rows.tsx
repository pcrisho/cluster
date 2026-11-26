"use client"

import { memo, useMemo } from "react"
import { useDraggable } from "@dnd-kit/core"
import {
  ChevronRightIcon,
  GripVerticalIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import type { FullOrgChartData } from "@/hooks/use-full-org-chart"
import { UNASSIGNED, type AssignmentResolution } from "@/lib/assignment-drop"
import { useDragSelector, type DragStore } from "@/lib/drag-store"
import { getImageUrl } from "@/lib/images"
import { OrgNodeIcon } from "@/components/shared/org-node-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

type OrgNodeFlat = FullOrgChartData["nodes"][number]

export interface OrgTreeNode extends OrgNodeFlat {
  children: OrgTreeNode[]
}

export interface UserLite {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  position: { id: string; name: string } | null
}

/** What the drag in progress is doing. Rows read only their own slice of it (`useDragSelector`). */
export interface AssignDragState {
  activeId: string | null
  /** The area under the pointer (`UNASSIGNED` for that group) and what dropping there does. */
  overId: string | null
  resolution: AssignmentResolution | null
  /** The person who just landed, for a moment. */
  landedId: string | null
}

type Store = DragStore<AssignDragState>

// Row actions show on hover and focus, and always on touch screens.
const ROW_ACTION =
  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100"

/** Highlights the row of the area a person would land in. */
function useIsTarget(store: Store, areaId: string) {
  return useDragSelector(
    store,
    (d) => d.overId === areaId && d.resolution?.kind === "ok"
  )
}

const TARGET = "bg-primary/10 ring-2 ring-primary"

/**
 * The only part of a person's row that talks to dnd-kit. `useDraggable` re-renders on every
 * change of dnd-kit's context, so it lives in this button and not in the whole row.
 */
const PersonDragHandle = memo(function PersonDragHandle({
  id,
  name,
}: {
  id: string
  name: string
}) {
  const t = useTranslations("settings.assignment")
  const { attributes, listeners, setNodeRef } = useDraggable({ id })
  const label = useMemo(() => t("dnd.drag", { name }), [t, name])
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
      aria-label={label}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
})

export const UserRow = memo(function UserRow({
  user,
  areaId,
  store,
  onOpenSheet,
  onRemove,
}: {
  user: UserLite
  /** The area the person is in, or `UNASSIGNED`; what dropping on this row means. */
  areaId: string
  store: Store
  onOpenSheet: (userId: string) => void
  onRemove?: (userId: string) => void
}) {
  const t = useTranslations("settings.assignment")
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`
  const isDragging = useDragSelector(store, (d) => d.activeId === user.id)
  const landed = useDragSelector(store, (d) => d.landedId === user.id)
  return (
    <div
      data-drop-area={areaId}
      className={cn(
        "group relative flex items-center gap-2 rounded-md border bg-background p-1.5 transition-colors duration-100 motion-reduce:transition-none",
        isDragging && "border-dashed bg-muted/30 *:opacity-40"
      )}
    >
      {landed && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-out rounded-md bg-primary/20 duration-1000 fade-out-0 fill-mode-forwards motion-reduce:hidden"
        />
      )}
      <PersonDragHandle
        id={user.id}
        name={`${user.firstName} ${user.lastName}`}
      />
      <Avatar className="size-7 shrink-0 max-sm:hidden">
        <AvatarImage
          src={getImageUrl(user.avatarUrl) || undefined}
          alt={`${user.firstName} ${user.lastName}`}
        />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">
        {user.firstName} {user.lastName}
      </span>
      {user.position && (
        <span className="truncate text-xs text-muted-foreground max-sm:hidden">
          {user.position.name}
        </span>
      )}
      <Button
        size="xs"
        variant="outline"
        onClick={() => onOpenSheet(user.id)}
        className={cn("ml-auto", ROW_ACTION)}
        aria-label={t("editAssignment")}
      >
        {t("assign")}
      </Button>
      {onRemove && (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => onRemove(user.id)}
          className={cn(
            "text-muted-foreground hover:text-destructive",
            ROW_ACTION
          )}
          aria-label={t("removeAssignment")}
          title={t("removeAssignment")}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
})

export const UnassignedGroup = memo(function UnassignedGroup({
  members,
  store,
  onOpenSheet,
  onRemove,
}: {
  members: UserLite[]
  store: Store
  onOpenSheet: (userId: string) => void
  onRemove: (userId: string) => void
}) {
  const t = useTranslations("settings.assignment")
  const isTarget = useIsTarget(store, UNASSIGNED)
  return (
    <div
      className={cn(
        "border-b p-2 transition-colors duration-100 motion-reduce:transition-none",
        isTarget && TARGET
      )}
    >
      <div
        data-drop-area={UNASSIGNED}
        className="mb-2 flex items-center gap-2 px-2"
      >
        <UserIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("unassigned")}</span>
        <StatusBadge tone={members.length > 0 ? "warning" : "success"}>
          {members.length}
        </StatusBadge>
      </div>
      {members.length === 0 ? (
        <p
          data-drop-area={UNASSIGNED}
          className="px-2 text-xs text-muted-foreground italic"
        >
          {t("allAssigned")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {members.map((m) => (
            <UserRow
              key={m.id}
              user={m}
              areaId={UNASSIGNED}
              store={store}
              onOpenSheet={onOpenSheet}
              onRemove={m.position ? onRemove : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
})

interface OrgNodeRowProps {
  node: OrgTreeNode
  depth: number
  membersByNode: Map<string, UserLite[]>
  expanded: Set<string>
  store: Store
  onToggleExpand: (id: string) => void
  onOpenSheet: (userId: string) => void
  onRemove: (userId: string) => void
}

export const OrgNodeRow = memo(function OrgNodeRow({
  node,
  depth,
  membersByNode,
  expanded,
  store,
  onToggleExpand,
  onOpenSheet,
  onRemove,
}: OrgNodeRowProps) {
  const t = useTranslations("settings.assignment")
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  // Each node looks up its own members so recursive children render their assigned users too.
  const members = membersByNode.get(node.id) ?? []
  const isTarget = useIsTarget(store, node.id)

  return (
    <div>
      <div
        data-drop-area={node.id}
        className={cn(
          "group flex items-center gap-1 rounded-lg pr-2 transition-colors duration-100 hover:bg-muted/50 motion-reduce:transition-none",
          depth === 0 && "mb-1",
          isTarget && TARGET
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren || members.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onToggleExpand(node.id)}
            aria-label={isExpanded ? t("collapse") : t("expand")}
            aria-expanded={isExpanded}
            className="text-muted-foreground"
          >
            <ChevronRightIcon
              className={cn(
                "size-3 transition-transform motion-reduce:transition-none",
                isExpanded && "rotate-90"
              )}
            />
          </Button>
        ) : (
          <span className="block size-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <OrgNodeIcon
            name={node.icon}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{node.name}</span>
        </button>
        <span className="flex w-10 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums">
          <UsersIcon className="size-3" aria-hidden />
          {members.length}
        </span>
      </div>

      {isExpanded && (
        <>
          {members.length > 0 && (
            <div
              className="flex flex-col gap-1.5 py-1.5"
              style={{ paddingLeft: `${depth * 16 + 36}px` }}
            >
              {members.map((m) => (
                <UserRow
                  key={m.id}
                  user={m}
                  areaId={node.id}
                  store={store}
                  onOpenSheet={onOpenSheet}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}

          {members.length === 0 && !hasChildren && (
            <p
              className="px-2 py-1.5 text-xs text-muted-foreground italic"
              style={{ paddingLeft: `${depth * 16 + 36}px` }}
            >
              {t("noPeople")}
            </p>
          )}

          {/* Depth increments here, so indentation is right whatever the API order. */}
          {node.children.map((child) => (
            <OrgNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              membersByNode={membersByNode}
              expanded={expanded}
              store={store}
              onToggleExpand={onToggleExpand}
              onOpenSheet={onOpenSheet}
              onRemove={onRemove}
            />
          ))}
        </>
      )}
    </div>
  )
})
