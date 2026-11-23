"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from "@dnd-kit/core"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react"

import type { PageTreeNode } from "@/lib/know-api"
import { pageTitle } from "@/lib/page-title"
import {
  buildTree,
  planDrop,
  planMove,
  type DropZone,
  type MoveAction,
  type MoveTarget,
  type TreeNode,
} from "@/lib/page-tree"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { useTranslations } from "next-intl"

interface PageTreeProps {
  spaceId: string
  pages: PageTreeNode[]
  activeId?: string
  canEdit: boolean
  onMove: (id: string, action: MoveAction) => void
  /** A page was dropped somewhere new; `target` is where the API should put it. */
  onDrop: (id: string, target: MoveTarget) => void
  onCreateChild: (parentId: string) => void
  /** Called after following a link, so a drawer can close. */
  onNavigate?: () => void
}

/** Each move's label is `know.tree.<action>`. */
const MOVES: { action: MoveAction; icon: typeof ArrowUpIcon }[] = [
  { action: "up", icon: ArrowUpIcon },
  { action: "down", icon: ArrowDownIcon },
  { action: "indent", icon: IndentIncreaseIcon },
  { action: "outdent", icon: IndentDecreaseIcon },
]

interface DropState {
  overId: string
  zone: DropZone
}

/** Top quarter of a row drops before it, bottom quarter after it, the middle inside it. */
function zoneAt(y: number, top: number, height: number): DropZone {
  if (y < top + height * 0.25) return "before"
  if (y > top + height * 0.75) return "after"
  return "inside"
}

export function PageTree({ pages, onDrop, ...rest }: PageTreeProps) {
  const roots = useMemo(() => buildTree(pages), [pages])
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const track = ({ active, over, activatorEvent, delta }: DragMoveEvent) => {
    if (!over || over.id === active.id || !(activatorEvent instanceof Event)) {
      return setDrop(null)
    }
    const { clientY } = activatorEvent as PointerEvent
    setDrop({
      overId: String(over.id),
      zone: zoneAt(clientY + delta.y, over.rect.top, over.rect.height),
    })
  }
  const finish = () => {
    if (dragId && drop) {
      const target = planDrop(roots, dragId, drop.overId, drop.zone)
      if (target) onDrop(dragId, target)
    }
    setDragId(null)
    setDrop(null)
  }
  const dragged = pages.find((p) => p.id === dragId)
  // Every branch is open unless the person closed it.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragId(String(active.id))}
      onDragMove={track}
      onDragEnd={finish}
      onDragCancel={() => {
        setDragId(null)
        setDrop(null)
      }}
    >
      <ul className="flex flex-col gap-0.5" role="tree">
        {roots.map((node) => (
          <Row
            key={node.id}
            node={node}
            depth={0}
            roots={roots}
            collapsed={collapsed}
            onToggle={toggle}
            drop={drop}
            {...rest}
          />
        ))}
      </ul>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="w-fit max-w-56 truncate rounded-md border bg-popover px-2 py-1.5 text-sm shadow-md">
            {pageTitle(dragged.title)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

interface RowProps extends Omit<PageTreeProps, "pages" | "onDrop"> {
  node: TreeNode
  depth: number
  roots: TreeNode[]
  collapsed: Set<string>
  onToggle: (id: string) => void
  drop: DropState | null
}

function Row({
  node,
  depth,
  roots,
  collapsed,
  onToggle,
  drop,
  ...rest
}: RowProps) {
  const ts = useTranslations("know.status")
  const t = useTranslations("know.tree")
  const { spaceId, activeId, canEdit, onMove, onCreateChild, onNavigate } = rest
  const drag = useDraggable({ id: node.id, disabled: !canEdit })
  const target = useDroppable({ id: node.id, disabled: !canEdit })
  const zone = drop?.overId === node.id ? drop.zone : null
  const hasChildren = node.children.length > 0
  const isOpen = !collapsed.has(node.id)
  const active = node.id === activeId

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={active}
    >
      <div
        ref={(el) => {
          drag.setNodeRef(el)
          target.setNodeRef(el)
        }}
        {...drag.attributes}
        {...drag.listeners}
        className={cn(
          "group/row relative flex items-center rounded-md pr-1 text-sm transition-colors",
          active
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          drag.isDragging && "opacity-40",
          zone === "inside" && "ring-2 ring-primary",
          zone === "before" &&
            "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:rounded before:bg-primary",
          zone === "after" &&
            "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded after:bg-primary"
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("shrink-0", !hasChildren && "invisible")}
          aria-label={isOpen ? t("collapse") : t("expand")}
          tabIndex={hasChildren ? 0 : -1}
          onClick={() => onToggle(node.id)}
        >
          <ChevronRightIcon
            className={cn("transition-transform", isOpen && "rotate-90")}
          />
        </Button>
        <Link
          href={`/know/spaces/${spaceId}/${node.id}`}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
          draggable={false}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 outline-none focus-visible:underline"
        >
          <EntityGlyph
            iconType={node.iconType}
            icon={node.icon}
            emoji={node.emoji}
            className="shrink-0"
          />
          <span className={cn("truncate pr-1", !node.title.trim() && "italic")}>
            {pageTitle(node.title)}
          </span>
          {node.status !== "PUBLISHED" && (
            <Badge
              variant="outline"
              className="ml-auto group-focus-within/row:hidden group-hover/row:hidden"
            >
              {ts(node.status)}
            </Badge>
          )}
        </Link>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("actions", { title: pageTitle(node.title) })}
                className="absolute right-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => onCreateChild(node.id)}>
                <PlusIcon />
                {t("newSubpage")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {MOVES.map(({ action, icon: Icon }) => (
                <DropdownMenuItem
                  key={action}
                  disabled={planMove(roots, node.id, action) === null}
                  onSelect={() => onMove(node.id, action)}
                >
                  <Icon />
                  {t(action)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul role="group" className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <Row
              key={child.id}
              node={child}
              depth={depth + 1}
              roots={roots}
              collapsed={collapsed}
              onToggle={onToggle}
              drop={drop}
              {...rest}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
