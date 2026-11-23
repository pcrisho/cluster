"use client"

import { useState, useMemo, useCallback } from "react"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { Building2Icon } from "lucide-react"
import { toast } from "sonner"

import type { Member } from "@/lib/admin-api"
import { orgApi } from "@/lib/org-api"
import { useFullOrgChart } from "@/hooks/use-full-org-chart"
import { useMembers } from "@/hooks/use-members"
import { usePositions } from "@/hooks/use-positions"
import { getErrorMessage } from "@/lib/api"
import { getImageUrl } from "@/lib/images"
import { useAuth } from "@/lib/auth-context"
import { peopleMovingPartition } from "@/lib/partition-moves"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserAssignmentTreeSkeleton } from "@/components/settings/settings-skeletons"
import { AssignmentSheet } from "@/components/settings/user-assignment-sheet"
import { DragChip } from "@/components/settings/drag-chip"
import {
  buildOrgTree,
  collectIds,
  filterSubtree,
} from "@/components/settings/assignment-tree-data"
import {
  OrgNodeRow,
  UnassignedGroup,
  type OrgTreeNode,
  type UserLite,
} from "@/components/settings/assignment-tree-rows"
import { useAssignmentDrag } from "@/components/settings/use-assignment-drag"
import { usePartitionConfirm } from "@/components/settings/partition-move-dialog"
import { useTranslations } from "next-intl"

interface UserAssignmentTreePanelProps {
  search: string
  onSearchChange: (v: string) => void
}

export function UserAssignmentTreePanel({
  search,
}: UserAssignmentTreePanelProps) {
  const t = useTranslations("settings.assignment")
  const {
    data,
    isLoading: isLoadingChart,
    refresh: refreshChart,
  } = useFullOrgChart()
  const {
    members: fetched,
    isLoading: isLoadingUsers,
    refresh: refreshUsers,
  } = useMembers()
  const { positions } = usePositions(true)

  const { user: viewer } = useAuth()
  const isolated = viewer?.organization.isolated ?? false
  const { ask, dialog } = usePartitionConfirm()
  const [editing, setEditing] = useState<Member | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const tree = useMemo(() => (data ? buildOrgTree(data.nodes) : []), [data])
  const areaName = useMemo(
    () => new Map((data?.nodes ?? []).map((n) => [n.id, n.name])),
    [data]
  )
  const positionArea = useMemo(() => {
    const byId = new Map(positions.map((p) => [p.id, p.orgNodeId]))
    return (id: string) => byId.get(id) ?? null
  }, [positions])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const openNode = useCallback((id: string) => {
    setExpanded((prev) => new Set(prev).add(id))
  }, [])

  const parents = useMemo(
    () => new Set((data?.nodes ?? []).map((n) => n.parentId)),
    [data]
  )
  const canOpen = useCallback(
    (id: string) =>
      parents.has(id) || fetched.some((u) => u.profile?.orgNode?.id === id),
    [parents, fetched]
  )

  const { users, store, drag, live, listRef, held, hint, dndProps } =
    useAssignmentDrag({
      fetched,
      areaName,
      positionArea,
      expanded,
      openNode,
      canOpen,
      refreshUsers,
      refreshChart,
      nodes: data?.nodes ?? [],
      isolated,
      ask,
    })

  const toLite = (u: Member): UserLite => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    position: u.profile?.position
      ? { id: u.profile.position.id, name: u.profile.position.name }
      : null,
  })

  // Map of orgNodeId → users assigned to it
  const membersByNode = useMemo(() => {
    const map = new Map<string, UserLite[]>()
    for (const u of users) {
      const nodeId = u.profile?.orgNode?.id
      if (!nodeId) continue
      if (!map.has(nodeId)) map.set(nodeId, [])
      map.get(nodeId)!.push(toLite(u))
    }
    return map
  }, [users])

  // Users with no orgNode
  const unassignedAll: UserLite[] = useMemo(
    () => users.filter((u) => !u.profile?.orgNode).map(toLite),
    [users]
  )

  // Apply search filter. When `search` is set, the tree is reduced
  // to only branches that contain a match (by node name
  // or any assigned user's name), and everything in the filtered
  // tree is auto-expanded so matches are visible.
  const trimmedSearch = search.trim().toLowerCase()
  const isSearching = trimmedSearch.length > 0

  const filteredMembersByNode = useMemo(() => {
    if (!isSearching) return membersByNode
    const map = new Map<string, UserLite[]>()
    for (const [nodeId, list] of membersByNode.entries()) {
      const filtered = list.filter((u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(trimmedSearch)
      )
      if (filtered.length > 0) map.set(nodeId, filtered)
    }
    return map
  }, [membersByNode, isSearching, trimmedSearch])

  const filteredUnassigned = useMemo(
    () =>
      isSearching
        ? unassignedAll.filter((u) =>
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(trimmedSearch)
          )
        : unassignedAll,
    [unassignedAll, isSearching, trimmedSearch]
  )

  // Compute the set of org-node ids that are "visible" when searching:
  // the union of (a) nodes whose own name matches, and (b) nodes
  // that have at least one matching user. Then the tree is pruned
  // to only the visible roots, preserving hierarchy.
  const filteredTree = useMemo(() => {
    if (!isSearching) return tree
    const visibleNodeIds = new Set<string>()
    for (const node of data?.nodes ?? []) {
      const nameMatch = node.name.toLowerCase().includes(trimmedSearch)
      const hasMatchingUser = filteredMembersByNode.has(node.id)
      if (nameMatch || hasMatchingUser) {
        visibleNodeIds.add(node.id)
        // Include all ancestors so the path to the match is preserved
        let parentId = node.parentId
        while (parentId) {
          visibleNodeIds.add(parentId)
          const parent = data?.nodes.find((n) => n.id === parentId)
          parentId = parent?.parentId ?? null
        }
      }
    }
    // Build a sub-tree containing only the visible nodes
    return tree
      .map((root) => filterSubtree(root, visibleNodeIds))
      .filter((n): n is OrgTreeNode => n !== null)
  }, [tree, isSearching, trimmedSearch, data?.nodes, filteredMembersByNode])

  // Auto-expand all visible nodes when searching
  const effectiveExpanded = useMemo(() => {
    if (!isSearching) return expanded
    const set = new Set(expanded)
    for (const root of filteredTree) {
      collectIds(root, set)
    }
    return set
  }, [isSearching, expanded, filteredTree])

  const openSheet = useCallback(
    (userId: string) => {
      const u = fetched.find((x) => x.id === userId)
      if (!u) return
      setEditing(u)
      setSheetOpen(true)
    },
    [fetched]
  )

  const handleRemove = useCallback(
    (userId: string) => {
      const apply = async () => {
        try {
          await orgApi.setAssignment(userId, {
            orgNodeId: null,
            positionId: null,
          })
          toast.success(t("removed"))
          await refreshUsers()
        } catch (e) {
          toast.error(getErrorMessage(e))
        }
      }
      const fromNodeId =
        fetched.find((u) => u.id === userId)?.profile?.orgNode?.id ?? null
      ask(
        peopleMovingPartition(
          data?.nodes ?? [],
          { kind: "person", fromNodeId, toNodeId: null },
          isolated
        ),
        () => void apply()
      )
    },
    [ask, data?.nodes, fetched, isolated, refreshUsers, t]
  )

  const handleSheetSuccess = useCallback(async () => {
    await refreshUsers()
    await refreshChart()
  }, [refreshUsers, refreshChart])

  // Only the first load shows the skeleton: a refresh after a move must not rebuild the page.
  if ((isLoadingChart && !data) || (isLoadingUsers && fetched.length === 0)) {
    return <UserAssignmentTreeSkeleton />
  }

  if (tree.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>{t("noAreasTitle")}</EmptyTitle>
          <EmptyDescription>{t("noAreasBody")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const isFiltered =
    isSearching && filteredTree.length === 0 && filteredUnassigned.length === 0

  return (
    <div className="flex flex-col gap-4">
      <DndContext {...dndProps}>
        <div ref={listRef} className="rounded-xl border">
          {/* Unassigned — always expanded, special group above the tree */}
          <UnassignedGroup
            members={filteredUnassigned}
            store={store}
            onOpenSheet={openSheet}
            onRemove={handleRemove}
          />

          {/* Org tree */}
          <div className="p-2">
            {filteredTree.map((node) => (
              <OrgNodeRow
                key={node.id}
                node={node}
                depth={0}
                membersByNode={filteredMembersByNode}
                expanded={effectiveExpanded}
                store={store}
                onToggleExpand={toggleExpand}
                onOpenSheet={openSheet}
                onRemove={handleRemove}
              />
            ))}
          </div>

          {isFiltered && (
            <div className="border-t p-4 text-center text-sm text-muted-foreground">
              {t("noMatch", { query: search })}
            </div>
          )}
        </div>
        {/* The move is already on screen, so the chip just goes: no flight back to where it started. */}
        <DragOverlay dropAnimation={null}>
          {held && (
            <DragChip
              icon={
                <Avatar className="size-7 shrink-0">
                  <AvatarImage
                    src={getImageUrl(held.avatarUrl) || undefined}
                    alt=""
                  />
                  <AvatarFallback className="text-xs">
                    {`${held.firstName[0] ?? ""}${held.lastName[0] ?? ""}`}
                  </AvatarFallback>
                </Avatar>
              }
              title={`${held.firstName} ${held.lastName}`}
              hint={hint(drag.overId, drag.resolution)}
            />
          )}
        </DragOverlay>
      </DndContext>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>

      <AssignmentSheet
        user={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleSheetSuccess}
        nodes={data?.nodes ?? []}
        isolated={isolated}
        ask={ask}
      />
      {dialog}
    </div>
  )
}
