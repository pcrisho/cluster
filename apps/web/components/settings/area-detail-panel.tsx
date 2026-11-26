"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArchiveIcon,
  BriefcaseIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { adminApi } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"
import type { FullOrgChartData } from "@/lib/org-api"
import { getImageUrl } from "@/lib/images"
import { OrgNodeIcon } from "@/components/shared/org-node-icon"
import { StatusBadge } from "@/components/ui/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

type AreaNode = FullOrgChartData["nodes"][number]
type Tab = "info" | "positions" | "members"

interface Member {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  position: { id: string; name: string } | null
}

interface AreaDetailPanelProps {
  node: AreaNode
  /** Every area, to name the parent and count the sub-areas. */
  nodes: AreaNode[]
  isAdmin: boolean
  /** Shown as a close button; a sheet brings its own. */
  onClose?: () => void
  onEdit: (node: AreaNode) => void
  onAddChild: (parentId: string) => void
  onArchive: (node: AreaNode) => void
}

/** Detail of the selected area: information, positions and members. Mount it with `key={node.id}`. */
export function AreaDetailPanel({
  node,
  nodes,
  isAdmin,
  onClose,
  onEdit,
  onAddChild,
  onArchive,
}: AreaDetailPanelProps) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.areaDetail")
  const [tab, setTab] = useState<Tab>("info")
  const [members, setMembers] = useState<Member[] | null>(null)
  const [membersTotal, setMembersTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // The area's enabled people, fifty at a time: the server filters, so a large area never loads the whole directory.
  const loadMembers = useCallback(
    async (page: number) => {
      const result = await adminApi.listMembers({
        orgNodeId: node.id,
        status: "ENABLED",
        pageSize: 50,
        page,
      })
      const next = result.items.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        avatarUrl: m.avatarUrl,
        position: m.profile?.position ?? null,
      }))
      setMembers((current) =>
        page === 1 ? next : [...(current ?? []), ...next]
      )
      setMembersTotal(result.total)
    },
    [node.id]
  )

  useEffect(() => {
    if (tab !== "members" || members) return
    queueMicrotask(() =>
      loadMembers(1).catch((e) => toast.error(getErrorMessage(e)))
    )
  }, [tab, members, loadMembers])

  const showMore = async () => {
    setLoadingMore(true)
    try {
      await loadMembers(Math.floor((members?.length ?? 0) / 50) + 1)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const parent = nodes.find((n) => n.id === node.parentId)
  const subAreas = nodes.filter((n) => n.parentId === node.id).length
  const isMain = node.parentId === null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex items-center gap-2 border-b p-4",
          // A sheet draws its own close button over the corner.
          !onClose && "pr-12"
        )}
      >
        <OrgNodeIcon
          name={node.icon}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          {isMain && (
            <p className="truncate text-xs text-muted-foreground">
              {t("mainNode")}
            </p>
          )}
          <h2 className="truncate text-base font-semibold">{node.name}</h2>
        </div>
        {onClose && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label={tc("close")}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b px-2">
          <TabsList variant="line">
            <TabsTrigger value="info">{t("info")}</TabsTrigger>
            <TabsTrigger value="positions">
              {t("positions")}
              <span className="text-xs text-muted-foreground tabular-nums">
                {node.positions.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="members">
              {t("members")}
              <span className="text-xs text-muted-foreground tabular-nums">
                {node._count.profiles}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="info" className="flex flex-col gap-4">
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
              {node.code && (
                <>
                  <dt className="text-muted-foreground">{t("code")}</dt>
                  <dd className="font-mono text-xs">{node.code}</dd>
                </>
              )}
              {isMain && (
                <>
                  <dt className="text-muted-foreground">{t("kind")}</dt>
                  <dd>
                    <StatusBadge tone={node.external ? "info" : "neutral"}>
                      {node.external ? t("external") : t("internal")}
                    </StatusBadge>
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("manager")}</dt>
              <dd>
                {node.manager ? (
                  <span className="flex items-center gap-2">
                    <PersonAvatar
                      firstName={node.manager.firstName}
                      lastName={node.manager.lastName}
                      avatarUrl={node.manager.avatarUrl}
                    />
                    <span className="truncate font-medium">
                      {node.manager.firstName} {node.manager.lastName}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("noManager")}
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("parent")}</dt>
              <dd className={cn(!parent && "text-muted-foreground")}>
                {parent?.name ?? t("noParent")}
              </dd>
              <dt className="text-muted-foreground">{t("subAreas")}</dt>
              <dd className="tabular-nums">{subAreas}</dd>
              <dt className="text-muted-foreground">{t("peopleLabel")}</dt>
              <dd className="tabular-nums">{node._count.profiles}</dd>
              <dt className="text-muted-foreground">{t("positions")}</dt>
              <dd className="tabular-nums">{node.positions.length}</dd>
            </dl>
            {isAdmin && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(node)}
                >
                  <PencilIcon data-icon="inline-start" />
                  {isMain ? t("editMain") : t("edit")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddChild(node.id)}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("addChild")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onArchive(node)}
                >
                  <ArchiveIcon data-icon="inline-start" />
                  {tc("archive")}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="positions">
            {node.positions.length === 0 ? (
              <TabEmpty
                icon={<BriefcaseIcon />}
                title={t("noPositions")}
                body={t("noPositionsBody")}
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {node.positions.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    {p.color ? (
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: p.color }}
                        aria-hidden
                      />
                    ) : (
                      <BriefcaseIcon className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("peopleCount", { count: p._count.profiles })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="members">
            {!members ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : members.length === 0 ? (
              <TabEmpty
                icon={<UsersIcon />}
                title={t("noPeople")}
                body={t("noPeopleBody")}
              />
            ) : (
              <div className="flex flex-col">
                <ul className="flex flex-col divide-y">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <PersonAvatar
                        firstName={m.firstName}
                        lastName={m.lastName}
                        avatarUrl={m.avatarUrl}
                        className="size-8"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.firstName} {m.lastName}
                        </p>
                        {m.position && (
                          <p className="truncate text-xs text-muted-foreground">
                            {m.position.name}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {members.length < membersTotal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 self-center"
                    onClick={() => void showMore()}
                    disabled={loadingMore}
                  >
                    {t("loadMore")}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export function PersonAvatar({
  firstName,
  lastName,
  avatarUrl,
  className,
}: {
  firstName: string
  lastName: string
  avatarUrl: string | null
  className?: string
}) {
  return (
    <Avatar className={cn("size-6 shrink-0", className)}>
      <AvatarImage src={getImageUrl(avatarUrl) || undefined} alt="" />
      <AvatarFallback className="text-xs">
        {`${firstName[0] ?? ""}${lastName[0] ?? ""}`}
      </AvatarFallback>
    </Avatar>
  )
}

function TabEmpty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
