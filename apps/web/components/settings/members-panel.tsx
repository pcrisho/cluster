"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  DownloadIcon,
  FileUpIcon,
  MailIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageToolbar } from "@/components/layout/page-toolbar"
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog"
import { MemberCapabilitiesDialog } from "@/components/settings/member-capabilities-dialog"
import { MemberDetailsSheet } from "@/components/settings/member-details-sheet"
import { AccessDialog } from "@/components/settings/access-dialog"
import {
  NodeAccessDialog,
  type NodeAccessMode,
} from "@/components/settings/node-access-dialog"
import {
  MemberIdentity,
  MemberMenu,
  MemberRole,
  MemberStatus,
} from "@/components/settings/member-row-parts"
import { SortHead } from "@/components/shared/sort-head"
import { TablePagination } from "@/components/shared/table-pagination"
import { MemberRowsSkeleton } from "@/components/settings/settings-skeletons"
import {
  adminApi,
  type AccessKind,
  type Member,
  type MembersPage,
  type MemberSort,
  type MemberState,
  type MemberUpdate,
} from "@/lib/admin-api"
import { useDebounce } from "@/hooks/use-debounce"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

type Filter = "ALL" | MemberState
const FILTERS: Filter[] = ["ALL", "ACTIVE", "PENDING", "DEACTIVATED"]

export function MembersPanel() {
  const tc = useTranslations("common")
  const t = useTranslations("settings.members")
  const { user } = useAuth()
  const [result, setResult] = useState<MembersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((value) => value + 1)
  const [query, setQuery] = useState("")
  const q = useDebounce(query, 300)
  const [filter, setFilter] = useState<Filter>("ALL")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<MemberSort>("name")
  const [order, setOrder] = useState<"asc" | "desc">("asc")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [permissionsFor, setPermissionsFor] = useState<Member | null>(null)
  const [editing, setEditing] = useState<Member | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<Member | null>(
    null
  )
  const [pendingMfaReset, setPendingMfaReset] = useState<Member | null>(null)
  // Off on this instance: the flows hand over an access link instead of e-mailing one.
  const [mailEnabled, setMailEnabled] = useState(true)
  const [accessFor, setAccessFor] = useState<{
    member: Member
    kind: AccessKind
  } | null>(null)
  const [nodeMode, setNodeMode] = useState<NodeAccessMode | null>(null)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setMailEnabled(i.mailEnabled))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setLoading(true)
      try {
        const next = await adminApi.listMembers({
          q,
          status: filter === "ALL" ? undefined : filter,
          page,
          pageSize,
          sort,
          order,
        })
        if (active) {
          setResult(next)
          setError(null)
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [q, filter, page, pageSize, sort, order, revision])

  const sortBy = (column: MemberSort) => {
    setSort(column)
    setOrder(sort === column && order === "asc" ? "desc" : "asc")
    setPage(1)
  }
  const clearFilters = () => {
    setQuery("")
    setFilter("ALL")
    setPage(1)
  }
  const isFiltered = filter !== "ALL" || q.trim() !== ""
  const members = result?.items ?? []

  // The single-member answer carries no mfaEnabled: keep the listed one.
  const replace = (updated: Member) =>
    setResult((page) =>
      page
        ? {
            ...page,
            items: page.items.map((m) =>
              m.id === updated.id ? { ...m, ...updated } : m
            ),
          }
        : page
    )

  async function update(member: Member, data: MemberUpdate) {
    setBusyId(member.id)
    try {
      replace(await adminApi.updateMember(member.id, data))
      // The member may now belong to another state filter.
      if (data.isActive !== undefined) reload()
      toast.success(t("updated"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function resend(member: Member) {
    setBusyId(member.id)
    try {
      const { inviteSent } = await adminApi.resendInvite(member.id)
      if (inviteSent) toast.success(t("inviteSent", { email: member.email }))
      else toast.error(t("inviteFailed"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function resetMfa(member: Member) {
    setBusyId(member.id)
    try {
      await adminApi.resetMemberMfa(member.id)
      setResult((page) =>
        page
          ? {
              ...page,
              items: page.items.map((m) =>
                m.id === member.id ? { ...m, mfaEnabled: false } : m
              ),
            }
          : page
      )
      toast.success(t("mfaReset"))
      if (!mailEnabled) setAccessFor({ member, kind: "link" })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const rowProps = (member: Member) => ({
    member,
    isSelf: member.id === user?.id,
    busy: busyId === member.id,
    onEdit: () => setEditing(member),
    onPermissions: () => setPermissionsFor(member),
    onResend: () => resend(member),
    onResetMfa: () => setPendingMfaReset(member),
    onDeactivate: () => setPendingDeactivate(member),
    onReactivate: () => update(member, { isActive: true }),
    onAccess: () => setAccessFor({ member, kind: "link" }),
    onPassword: () => setAccessFor({ member, kind: "password" }),
    mailEnabled,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        className="sm:items-start"
        left={
          <>
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                maxLength={100}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={filter}
              onValueChange={(value) => {
                if (value) {
                  setFilter(value as Filter)
                  setPage(1)
                }
              }}
              aria-label={t("filterByStatus")}
              className="w-full overflow-x-auto sm:w-auto sm:overflow-visible [&>*]:flex-none"
            >
              {FILTERS.map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {t(`filter.${value}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
        primaryAction={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlusIcon data-icon="inline-start" />
            {t("invite")}
          </Button>
        }
        secondaryActions={
          <>
            <Button variant="outline" asChild>
              <Link href="/settings/members/import">
                <FileUpIcon data-icon="inline-start" />
                {t("import")}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setNodeMode("export")}>
              <DownloadIcon data-icon="inline-start" />
              {t("exportAccess")}
            </Button>
            {mailEnabled && (
              <Button variant="outline" onClick={() => setNodeMode("invite")}>
                <MailIcon data-icon="inline-start" />
                {t("sendInvitations")}
              </Button>
            )}
          </>
        }
      />

      <div className="lg:hidden">
        <Select
          value={`${sort}:${order}`}
          onValueChange={(value) => {
            const [column, direction] = value.split(":")
            setSort(column as MemberSort)
            setOrder(direction as "asc" | "desc")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full" aria-label={t("sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="name:asc">{t("nameAscending")}</SelectItem>
              <SelectItem value="name:desc">{t("nameDescending")}</SelectItem>
              <SelectItem value="role:asc">{t("roleAscending")}</SelectItem>
              <SelectItem value="role:desc">{t("roleDescending")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4" aria-busy={loading}>
        {loading ? (
          <MemberRowsSkeleton />
        ) : error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>{t("loadFailed")}</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={reload}>
                {t("tryAgain")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : members.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t("noMatch")}</EmptyTitle>
              <EmptyDescription>{t("noMatchBody")}</EmptyDescription>
            </EmptyHeader>
            {isFiltered && (
              <EmptyContent>
                <Button variant="outline" onClick={clearFilters}>
                  {t("clearFilters")}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border lg:block">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <SortHead
                      sort="name"
                      label={t("name")}
                      active={sort === "name"}
                      order={order}
                      onSort={sortBy}
                    />
                    <SortHead
                      sort="role"
                      label={t("role")}
                      active={sort === "role"}
                      order={order}
                      onSort={sortBy}
                    />
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="py-3">
                        <MemberIdentity member={member} />
                      </TableCell>
                      <TableCell>
                        <MemberRole
                          member={member}
                          disabled={
                            member.id === user?.id ||
                            member.isSuperAdmin ||
                            busyId === member.id
                          }
                          onChange={(role) => update(member, { role })}
                        />
                      </TableCell>
                      <TableCell>
                        <MemberStatus member={member} />
                      </TableCell>
                      <TableCell>
                        <MemberMenu {...rowProps(member)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="flex flex-col divide-y rounded-xl border lg:hidden">
              {members.map((member) => (
                <li key={member.id} className="flex flex-col gap-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <MemberIdentity member={member} />
                    <MemberMenu {...rowProps(member)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-11">
                    <MemberRole
                      member={member}
                      disabled={
                        member.id === user?.id ||
                        member.isSuperAdmin ||
                        busyId === member.id
                      }
                      onChange={(role) => update(member, { role })}
                    />
                    <MemberStatus member={member} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {!loading && !error && result && (
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </div>

      <AlertDialog
        open={!!pendingDeactivate}
        onOpenChange={(open) => !open && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deactivateTitle", {
                name: `${pendingDeactivate?.firstName ?? ""} ${pendingDeactivate?.lastName ?? ""}`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deactivateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeactivate)
                  void update(pendingDeactivate, { isActive: false })
                setPendingDeactivate(null)
              }}
            >
              {t("deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingMfaReset}
        onOpenChange={(open) => !open && setPendingMfaReset(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("resetMfaTitle", {
                name: `${pendingMfaReset?.firstName ?? ""} ${pendingMfaReset?.lastName ?? ""}`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("resetMfaBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingMfaReset) void resetMfa(pendingMfaReset)
                setPendingMfaReset(null)
              }}
            >
              {t("resetMfaMenu")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing && (
        <MemberDetailsSheet
          key={editing.id}
          member={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={replace}
        />
      )}
      <MemberCapabilitiesDialog
        member={permissionsFor}
        onOpenChange={(open) => !open && setPermissionsFor(null)}
      />
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(member, mail) => {
          reload()
          if (!mail) setAccessFor({ member, kind: "link" })
        }}
      />
      {nodeMode && (
        <NodeAccessDialog
          mode={nodeMode}
          onOpenChange={(open) => !open && setNodeMode(null)}
        />
      )}
      {accessFor && (
        <AccessDialog
          key={`${accessFor.member.id}-${accessFor.kind}`}
          member={accessFor.member}
          initialKind={accessFor.kind}
          mailEnabled={mailEnabled}
          onOpenChange={(open) => !open && setAccessFor(null)}
        />
      )}
    </div>
  )
}
