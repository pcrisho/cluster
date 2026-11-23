"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import dagre from "@dagrejs/dagre"
import { GitBranchIcon, TriangleAlertIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"

import { directoryHrefForAreas } from "@/lib/directory-url"
import type { OrgNode } from "@/lib/org-api"
import {
  defaultCollapsed,
  subtreeIds,
  subtreeMemberCounts,
  visibleAreas,
} from "@/lib/org-chart-tree"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  NODE_H,
  NODE_W,
  OrgChartNode,
  type OrgChartNodeData,
} from "@/components/connect/org-chart-node"

interface OrgChartCanvasProps {
  nodes: OrgNode[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

type Orientation = "vertical" | "horizontal"

const nodeTypes: NodeTypes = { orgChart: OrgChartNode }

// Below 0.85 the 14 px names drop under 12 px: a wide tree is panned, not shrunk.
const MIN_FIT_ZOOM = 0.85
const FIT_PADDING = 24
// The orientation switch floats over the top edge.
const TOP_PADDING = 64
const FIT = {
  minZoom: MIN_FIT_ZOOM,
  maxZoom: 1,
  padding: {
    top: `${TOP_PADDING}px` as const,
    right: `${FIT_PADDING}px` as const,
    bottom: `${FIT_PADDING}px` as const,
    left: `${FIT_PADDING}px` as const,
  },
  duration: 200,
}

// React Flow reads its colours from these variables; point them at the design tokens.
const FLOW_STYLE = {
  "--xy-edge-stroke": "var(--muted-foreground)",
  "--xy-edge-stroke-width": 1.25,
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--muted)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-controls-box-shadow": "none",
  "--xy-attribution-background-color": "transparent",
} as CSSProperties

function layout(areas: OrgNode[], orientation: Orientation) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: orientation === "vertical" ? "TB" : "LR",
    nodesep: 24,
    ranksep: 64,
    marginx: 24,
    marginy: 24,
  })
  g.setDefaultEdgeLabel(() => ({}))
  for (const a of areas) g.setNode(a.id, { width: NODE_W, height: NODE_H })
  const ids = new Set(areas.map((a) => a.id))
  for (const a of areas)
    if (a.parentId && ids.has(a.parentId)) g.setEdge(a.parentId, a.id)
  dagre.layout(g)
  return g
}

export function OrgChartCanvas({
  nodes: flatNodes,
  isLoading,
  error,
  onRetry,
}: OrgChartCanvasProps) {
  const tc = useTranslations("common")
  const t = useTranslations("connect.directory")
  const flow = useReactFlow()
  // Primitives: a selector that returns a new object re-renders forever.
  const vw = useStore((st) => st.width)
  const vh = useStore((st) => st.height)
  const { resolvedTheme } = useTheme()
  const [orientation, setOrientation] = useState<Orientation>("vertical")
  // null until the user toggles a branch: the default depends on the areas, which load late.
  const [collapsedState, setCollapsedState] = useState<Set<string> | null>(null)
  const collapsed = useMemo(
    () => collapsedState ?? defaultCollapsed(flatNodes),
    [collapsedState, flatNodes]
  )

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed)
      if (!next.delete(id)) next.add(id)
      setCollapsedState(next)
    },
    [collapsed]
  )

  const { nodes, edges } = useMemo(() => {
    const visible = visibleAreas(flatNodes, collapsed)
    const g = layout(visible, orientation)
    const members = subtreeMemberCounts(flatNodes)
    const hasChildren = new Set(flatNodes.map((a) => a.parentId))
    const nodes: Node<OrgChartNodeData>[] = visible.flatMap((a) => {
      const p = g.node(a.id)
      if (!p) return []
      const isCollapsed = collapsed.has(a.id)
      return {
        id: a.id,
        type: "orgChart",
        width: NODE_W,
        height: NODE_H,
        position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
        data: {
          name: a.name,
          manager: a.manager,
          members: members.get(a.id) ?? 0,
          href: directoryHrefForAreas(subtreeIds(flatNodes, a.id)),
          orientation,
          collapsed: hasChildren.has(a.id) ? isCollapsed : undefined,
          hiddenAreas: subtreeIds(flatNodes, a.id).length - 1,
          onToggle: () => toggle(a.id),
        },
      }
    })
    const shown = new Set(visible.map((a) => a.id))
    const edges: Edge[] = visible
      .filter((a) => a.parentId && shown.has(a.parentId))
      .map((a) => ({
        id: `${a.parentId}->${a.id}`,
        source: a.parentId as string,
        target: a.id,
        type: "smoothstep",
      }))
    return { nodes, edges }
  }, [flatNodes, collapsed, orientation, toggle])

  // Refit when the set of nodes or the direction changes, not on every render. A tree too wide to fit
  // at a readable zoom is anchored top-left so the root stays on screen.
  const shape = nodes.map((n) => n.id).join() + orientation
  useEffect(() => {
    if (!shape || !vw) return
    const frame = requestAnimationFrame(() => {
      const box = flow.getNodesBounds(flow.getNodes())
      const fits =
        (box.width + FIT_PADDING * 2) * MIN_FIT_ZOOM <= vw &&
        (box.height + FIT_PADDING + TOP_PADDING) * MIN_FIT_ZOOM <= vh
      if (fits) void flow.fitView(FIT)
      else
        void flow.setViewport(
          {
            x: FIT_PADDING - box.x * MIN_FIT_ZOOM,
            y: TOP_PADDING - box.y * MIN_FIT_ZOOM,
            zoom: MIN_FIT_ZOOM,
          },
          { duration: 200 }
        )
    })
    return () => cancelAnimationFrame(frame)
  }, [shape, flow, vw, vh])

  if (isLoading) return <Skeleton className="min-h-96 flex-1 rounded-xl" />

  if (error || flatNodes.length === 0) {
    return (
      <Empty className="min-h-96 flex-1 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {error ? <TriangleAlertIcon /> : <GitBranchIcon />}
          </EmptyMedia>
          <EmptyTitle>
            {error ? t("loadFailed") : t("orgChartEmpty")}
          </EmptyTitle>
          {error && <EmptyDescription>{error}</EmptyDescription>}
        </EmptyHeader>
        {error && (
          <Button variant="outline" onClick={onRetry}>
            {tc("retry")}
          </Button>
        )}
      </Empty>
    )
  }

  return (
    <div className="min-h-[min(32rem,calc(100dvh-14rem))] flex-1 overflow-hidden rounded-xl border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        defaultViewport={{ x: FIT_PADDING, y: TOP_PADDING, zoom: MIN_FIT_ZOOM }}
        minZoom={0.3}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        attributionPosition="bottom-right"
        style={FLOW_STYLE}
        ariaLabelConfig={{
          "controls.zoomIn.ariaLabel": t("zoomIn"),
          "controls.zoomOut.ariaLabel": t("zoomOut"),
          "controls.fitView.ariaLabel": t("fitView"),
        }}
      >
        <Controls showInteractive={false} />
        <Background color="var(--border)" gap={20} size={1.5} />
        <Panel position="top-right">
          <ToggleGroup
            type="single"
            value={orientation}
            onValueChange={(v) => {
              if (v) setOrientation(v as Orientation)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            className="bg-background"
          >
            <ToggleGroupItem value="vertical">{t("vertical")}</ToggleGroupItem>
            <ToggleGroupItem value="horizontal">
              {t("horizontal")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Panel>
      </ReactFlow>
    </div>
  )
}
