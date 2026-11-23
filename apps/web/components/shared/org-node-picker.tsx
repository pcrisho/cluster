"use client"

import * as React from "react"
import { ChevronRightIcon, GlobeIcon } from "lucide-react"

import { OrgNode } from "@/lib/org-api"
import { useOrgNodes } from "@/hooks/use-org-nodes"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const GLOBAL = "__global__"
const NONE = "__none__"

interface OrgNodePickerProps {
  value?: string | null
  onChange: (nodeId: string | null) => void
  disabled?: boolean
  /** Offer "Global" (no area). Off where the person must keep an area. */
  allowGlobal?: boolean
  defaultNodeId?: string | null
  className?: string
}

/**
 * Cascading combobox for picking an org node. The caller supplies the label.
 * - First combo: top-level nodes + "Global" option.
 * - Subsequent combos: children of the previous selection (capped at depth 6).
 * - User can stop at any level (Nivel 1, 2, 3, ...).
 */
export function OrgNodePicker({
  value,
  onChange,
  disabled,
  allowGlobal = true,
  defaultNodeId = null,
  className,
}: OrgNodePickerProps) {
  const t = useTranslations("shared.areaPicker")
  const { nodes, isLoading } = useOrgNodes()

  // Build a node lookup
  const nodeMap = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  )

  // Group children by parent
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string | null, OrgNode[]>()
    for (const n of nodes.filter((n) => n.isActive)) {
      const key = n.parentId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(n)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [nodes])

  // Resolve an id to a full path (root -> leaf) of ids
  const resolvePath = React.useCallback(
    function resolvePathImpl(id: string | null): string[] {
      if (!id) return []
      const path: string[] = []
      let current = nodeMap.get(id)
      while (current) {
        path.unshift(current.id)
        current = current.parentId ? nodeMap.get(current.parentId) : undefined
      }
      return path
    },
    [nodeMap]
  )

  // Internal state: the selected path.
  // We seed lazily from the initial value/defaultNodeId but only on the first render.
  const initialNodeId = value !== undefined ? value : defaultNodeId
  const [path, setPath] = React.useState<string[]>(() =>
    resolvePath(initialNodeId)
  )

  // Follow the value, and resolve it again once the nodes load (the first render may have had none).
  // A path whose leaf already is the value stays: that is the person's own selection.
  React.useEffect(() => {
    if (value === undefined) return
    const next = resolvePath(value)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath((cur) =>
      (cur[cur.length - 1] ?? null) === (value ?? null) ||
      cur.join() === next.join()
        ? cur
        : next
    )
  }, [value, resolvePath])

  const isGlobal = (value ?? null) === null && path.length === 0
  const rootNodes = childrenByParent.get(null) ?? []
  const topLevel = path[0]

  function selectTopLevel(id: string) {
    if (id === GLOBAL) {
      setPath([])
      onChange(null)
    } else {
      setPath([id])
      onChange(id)
    }
  }

  function selectAtLevel(level: number, id: string) {
    if (id === NONE) {
      // Stop at this level: keep path up to (but not including) this level
      const newPath = path.slice(0, level)
      setPath(newPath)
      const leaf = newPath[newPath.length - 1] ?? null
      onChange(leaf)
    } else {
      const newPath = [...path.slice(0, level), id]
      setPath(newPath)
      onChange(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3" />
        {t("loading")}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Level 1: Global + top-level org nodes */}
      <Select
        value={isGlobal && allowGlobal ? GLOBAL : (topLevel ?? NONE)}
        onValueChange={selectTopLevel}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("pickUpper")} />
        </SelectTrigger>
        <SelectContent>
          {allowGlobal && (
            <SelectItem value={GLOBAL}>
              <span className="flex items-center gap-2">
                <GlobeIcon className="size-3" />
                {t("globalWhole")}
              </span>
            </SelectItem>
          )}
          {rootNodes.length > 0 && (
            <>
              <SelectItem value={NONE} disabled>
                {t("areasHeading")}
              </SelectItem>
              {rootNodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {/* Level 2+ */}
      {path.map((parentId, idx) => {
        const level = idx + 1
        if (level > 6) return null
        const currentAtLevel = path[level]
        return (
          <ChildrenSelect
            key={`${parentId}-${level}`}
            parentId={parentId}
            childrenByParent={childrenByParent}
            value={currentAtLevel ?? NONE}
            onChange={(v) => selectAtLevel(level, v)}
            disabled={disabled}
            depth={level}
          />
        )
      })}
    </div>
  )
}

interface ChildrenSelectProps {
  parentId: string
  childrenByParent: Map<string | null, OrgNode[]>
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  depth: number
}

function ChildrenSelect({
  parentId,
  childrenByParent,
  value,
  onChange,
  disabled,
  depth,
}: ChildrenSelectProps) {
  const t = useTranslations("shared.areaPicker")
  const children = childrenByParent.get(parentId) ?? []
  if (children.length === 0) return null

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t("level", { level: depth + 1 })} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="flex items-center gap-2 text-muted-foreground">
            <ChevronRightIcon className="size-3" />
            {t("noSubArea")}
          </span>
        </SelectItem>
        {children.map((n) => (
          <SelectItem key={n.id} value={n.id}>
            {n.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
