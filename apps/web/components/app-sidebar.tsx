"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  NavMain,
  type NavBadges,
  type NavShortcuts,
} from "@/components/nav-main"
import { SidebarSearch } from "@/components/sidebar-search"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { NavUser } from "@/components/nav-user"
import { OrgHeader } from "@/components/org-header"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { growApi, type PendingCourses } from "@/lib/grow-api"
import { profileHref, visibleNavGroups } from "@/lib/navigation"
import { useAuth } from "@/lib/auth-context"
import { useTranslations } from "next-intl"
import type { AuthUser } from "@/lib/api"

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
}) {
  const pathname = usePathname()
  const { logout } = useAuth()
  const t = useTranslations("shell.nav")

  const [pending, setPending] = React.useState<PendingCourses>({
    pending: 0,
    overdue: 0,
    courses: [],
  })
  const hasGrow = user.modules.includes("GROW")
  // Changes with every page inside GROW, and stays put elsewhere.
  const countKey = pathname.startsWith("/grow") ? pathname : "elsewhere"
  // shortcut: read on load and on every move inside GROW (where it can change); a course assigned meanwhile shows on the next load.
  React.useEffect(() => {
    if (!hasGrow) return
    let current = true
    growApi
      .getPendingCount()
      .then((counts) => current && setPending(counts))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [hasGrow, countKey])
  const badges: NavBadges = hasGrow
    ? { "/grow": { count: pending.pending } }
    : {}
  const shortcuts: NavShortcuts = hasGrow
    ? {
        "/grow": {
          label: t("pendingCourses"),
          items: pending.courses.map((c) => ({
            href: `/grow/courses/${c.id}`,
            title: c.title,
            icon: (
              <EntityGlyph
                iconType={c.iconType}
                icon={c.icon}
                emoji={c.emoji}
                fallback="graduation"
              />
            ),
            urgent: c.state === "OVERDUE",
          })),
          more: pending.pending > pending.courses.length,
        },
      }
    : {}

  const userDisplay = {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    initials: `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`,
    avatarUrl: user.avatarUrl,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* No divider: the organization and the user are cards, so there is no line to line up with the page header (64 px, 48 px collapsed). */}
      <SidebarHeader>
        <OrgHeader
          name={user.organization?.name ?? ""}
          role={user.role}
          logoUrl={user.organization?.logoUrl ?? null}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarSearch />
        <NavMain
          sections={visibleNavGroups(user)}
          pathname={pathname}
          badges={badges}
          shortcuts={shortcuts}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={userDisplay}
          onLogout={logout}
          profileHref={profileHref(user)}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
