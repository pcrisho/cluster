"use client"

import { memo, useMemo } from "react"
import { useDraggable } from "@dnd-kit/core"
import {
  ArchiveIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react"

import type { OrgNode } from "@/lib/org-api"
import type { Resolution } from "@/lib/area-drop"
import type { DropZone } from "@/lib/tree-dnd"
import { useDragSelector, type DragStore } from "@/lib/drag-store"
import { OrgNodeIcon } from "@/components/shared/org-node-icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

export interface TreeNode extends OrgNode {
  positions: {
    id: string
    name: string
    color: string | null
    _count: { profiles: number }
  }[]
  children: TreeNode[]
}

/** What the drag in progress is doing. Rows read only their own slice of it (`useDragSelector`). */
export interface DragState {
  activeId: string | null
  /** The row under the pointer and what dropping there would do. */
  overId: string | null
  zone: DropZone | null
  resolution: Resolution | null
  /** The row that just landed, for a moment. */
  landedId: string | null
}

interface AreaTreeRowProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggleExpand: (id: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
  onAddChild: (parentId: string) => void
  onArchive: (node: TreeNode) => void
  isAdmin: boolean
  store: DragStore<DragState>
}

const INDENT = 16

/**
 * The only part of a row that talks to dnd-kit. `useDraggable` re-renders on every change of dnd-kit's
 * context, so it lives here, in a button, and not in the whole row.
 */
const AreaDragHandle = memo(function AreaDragHandle({
  id,
  name,
  disabled,
}: {
  id: string
  name: string
  disabled: boolean
}) {
  const t = useTranslations("settings.areaTree")
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled })
  const label = useMemo(() => t("drag", { name }), [t, name])
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
      aria-label={label}
      disabled={disabled}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
})

export const AreaTreeRow = memo(function AreaTreeRow({
  node,
  depth,
  expanded,
  toggleExpand,
  onSelect,
  selectedId,
  onAddChild,
  onArchive,
  isAdmin,
  store,
}: AreaTreeRowProps) {
  const t = useTranslations("settings.areaTree")
  const isDragging = useDragSelector(store, (d) => d.activeId === node.id)
  const countTitle = useMemo(
    () => t("people", { count: node._count.profiles }),
    [t, node._count.profiles]
  )

  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  const isSelected = selectedId === node.id

  const over = useDragSelector(store, (d) =>
    d.overId === node.id ? d.resolution : null
  )
  const landed = useDragSelector(store, (d) => d.landedId === node.id)
  const zone = over?.kind === "ok" ? over.zone : null
  const refused = over?.kind === "refused"
  const left = depth * INDENT + 4

  return (
    <div>
      <div
        data-area-id={node.id}
        className={cn(
          "group relative flex items-center gap-1 rounded-lg border border-transparent pr-2 transition-[background-color,box-shadow] duration-100 motion-reduce:transition-none",
          isSelected ? "bg-accent" : "hover:bg-muted/50",
          !node.isActive && "opacity-60",
          isDragging && "border-dashed border-border bg-muted/30 *:opacity-40",
          zone === "inside" && "bg-primary/10 ring-2 ring-primary",
          refused && "bg-danger-subtle ring-1 ring-danger-border"
        )}
        style={{ paddingLeft: `${left}px` }}
      >
        {landed && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-out rounded-lg bg-primary/20 duration-1000 fade-out-0 fill-mode-forwards motion-reduce:hidden"
          />
        )}
        {(zone === "before" || zone === "after") && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-2 z-10 flex h-0.5 animate-in items-center rounded-full bg-primary duration-100 fade-in-0 motion-reduce:animate-none",
              zone === "before" ? "-top-px" : "-bottom-px"
            )}
            style={{ left: `${left}px` }}
          >
            <span className="absolute -left-1 size-2 rounded-full bg-primary" />
          </span>
        )}
        {isAdmin && (
          <AreaDragHandle
            id={node.id}
            name={node.name}
            disabled={!node.isActive}
          />
        )}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => toggleExpand(node.id)}
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
          onClick={() => onSelect(node.id)}
          aria-pressed={isSelected}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <OrgNodeIcon
            name={node.icon}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{node.name}</span>
        </button>
        <span
          className="flex w-10 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums"
          title={countTitle}
        >
          <UsersIcon className="size-3" aria-hidden />
          {node._count.profiles}
        </span>
        {isAdmin && (
          <div
            className={cn(
              "flex w-14 shrink-0 items-center justify-end gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100 max-sm:hidden",
              isSelected && "opacity-100"
            )}
          >
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onAddChild(node.id)}
              aria-label={t("addChild")}
            >
              <PlusIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onArchive(node)}
              aria-label={t("archive")}
            >
              <ArchiveIcon />
            </Button>
          </div>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <AreaTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
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
      )}
    </div>
  )
})
