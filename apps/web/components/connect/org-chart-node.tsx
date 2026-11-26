"use client"

import Link from "next/link"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ChevronUpIcon, UserRoundIcon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { OrgNode } from "@/lib/org-api"
import { DirectoryAvatar } from "@/components/connect/directory-avatar"

export const NODE_W = 240
export const NODE_H = 72

export interface OrgChartNodeData extends Record<string, unknown> {
  name: string
  manager: OrgNode["manager"]
  /** Members of the area and of every area under it. */
  members: number
  href: string
  orientation: "vertical" | "horizontal"
  /** Areas hidden under this one while it is collapsed; undefined when it has no children. */
  collapsed?: boolean
  hiddenAreas: number
  onToggle?: () => void
}

/** An area: its name, who runs it and how many people are in it; the card opens the filtered directory. */
export function OrgChartNode({ data }: NodeProps) {
  const t = useTranslations("connect.directory")
  const d = data as OrgChartNodeData
  const horizontal = d.orientation === "horizontal"
  const hasChildren = d.collapsed !== undefined
  const managerName = d.manager
    ? `${d.manager.firstName} ${d.manager.lastName}`
    : null

  return (
    <div
      className="group pointer-events-auto relative flex flex-col justify-center gap-1.5 rounded-xl border bg-card px-3 shadow-xs transition-colors hover:border-ring"
      style={{ width: NODE_W, height: NODE_H }}
    >
      {/* Connection points only anchor the connectors; nobody drags them. */}
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        isConnectable={false}
        className="opacity-0"
      />
      <Link
        href={d.href}
        aria-label={t("viewAreaMembers", { count: d.members, area: d.name })}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <UsersIcon className="size-3.5" aria-hidden />
          {d.members}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {d.manager ? (
          <DirectoryAvatar user={d.manager} size="sm" />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
            <UserRoundIcon className="size-3" aria-hidden />
          </span>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {managerName ?? t("noManager")}
        </p>
      </div>
      {hasChildren && (
        <button
          type="button"
          onClick={d.onToggle}
          aria-expanded={!d.collapsed}
          aria-label={t(d.collapsed ? "expandArea" : "collapseArea", {
            count: d.hiddenAreas,
            area: d.name,
          })}
          className={cn(
            "nodrag nopan absolute z-10 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border bg-background px-1.5 text-xs text-muted-foreground tabular-nums shadow-xs transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            horizontal
              ? "top-1/2 -right-3 -translate-y-1/2"
              : "-bottom-3 left-1/2 -translate-x-1/2"
          )}
        >
          {d.collapsed ? (
            `+${d.hiddenAreas}`
          ) : (
            <ChevronUpIcon
              className={cn("size-3.5", horizontal && "-rotate-90")}
            />
          )}
        </button>
      )}
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        isConnectable={false}
        className="opacity-0"
      />
    </div>
  )
}
