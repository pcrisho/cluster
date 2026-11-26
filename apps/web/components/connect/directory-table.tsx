"use client"

import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { DirectoryUser } from "@/lib/connect-api"
import type { DirectorySortKey } from "@/lib/directory-url"
import { DirectoryAvatar } from "@/components/connect/directory-avatar"
import { SortHead } from "@/components/shared/sort-head"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type DirectoryColumnId = "position" | "area"
export type DirectoryColumns = Partial<Record<DirectoryColumnId, boolean>>

interface DirectoryTableProps {
  users: DirectoryUser[]
  sort: DirectorySortKey
  onSortChange: (sort: DirectorySortKey) => void
  columns: DirectoryColumns
}

const profileHref = (u: DirectoryUser) => `/connect/directory/${u.id}`

const Dash = () => <span className="text-muted-foreground">&mdash;</span>

/** Same shape as the GROW reports table: own scroller, sticky header, a list below `lg`. */
export function DirectoryTable({
  users,
  sort,
  onSortChange,
  columns,
}: DirectoryTableProps) {
  const t = useTranslations("connect.directory")
  const tr = useTranslations("common.roles")
  const order = sort === "name-asc" ? "asc" : "desc"

  return (
    <>
      {/* The outer box scrolls, so the header can stick while a long page scrolls. */}
      <div className="hidden max-h-[calc(100svh-19rem)] min-h-64 overflow-auto rounded-lg border lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
            <TableRow>
              <SortHead
                label={t("fields.member")}
                sort="name"
                active
                order={order}
                onSort={() =>
                  onSortChange(sort === "name-asc" ? "name-desc" : "name-asc")
                }
              />
              {columns.position !== false && (
                <TableHead>{t("fields.position")}</TableHead>
              )}
              {columns.area !== false && (
                <TableHead>{t("fields.area")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="relative">
                <TableCell className="w-[40%]">
                  <div className="flex items-center gap-3">
                    <DirectoryAvatar user={u} />
                    <div className="min-w-0">
                      {/* Stretched link: the whole row opens the profile with one tab stop. */}
                      <Link
                        href={profileHref(u)}
                        className="block truncate font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
                      >
                        {u.firstName} {u.lastName}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tr(u.role)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                {columns.position !== false && (
                  <TableCell>{u.profile?.position?.name ?? <Dash />}</TableCell>
                )}
                {columns.area !== false && (
                  <TableCell className="text-muted-foreground">
                    {u.profile?.orgNode?.name ?? <Dash />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y overflow-hidden rounded-lg border lg:hidden">
        {users.map((u) => {
          const meta = [u.profile?.position?.name, u.profile?.orgNode?.name]
            .filter(Boolean)
            .join(" · ")
          return (
            <li key={u.id}>
              <Link
                href={profileHref(u)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <DirectoryAvatar user={u} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {u.firstName} {u.lastName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {meta || tr(u.role)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
