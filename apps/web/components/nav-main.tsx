"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { CountBadge } from "@/components/ui/count-badge"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { NavGroup, NavRoute, NavSubgroup } from "@/lib/navigation"

/** A count shown on a link, as the notification bell shows its count. */
export type NavBadges = Record<string, { count: number }>

/** Links listed under a route (e.g. pending courses under Courses); `more` adds a "See all" back to the route. */
export type NavShortcuts = Record<
  string,
  {
    /** Names the list for the toggle (already translated). */
    label: string
    items: {
      href: string
      title: string
      icon: React.ReactNode
      urgent: boolean
    }[]
    more: boolean
  }
>

export function NavMain({
  sections,
  pathname,
  badges = {},
  shortcuts = {},
}: {
  sections: NavGroup[]
  pathname: string
  badges?: NavBadges
  shortcuts?: NavShortcuts
}) {
  return (
    <>
      {sections.map((section) => (
        <SidebarGroup
          key={section.title}
          className={cn(section.pinned && "mt-auto")}
        >
          {!section.hideTitle && (
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            {section.subgroups.map((subgroup, idx) => (
              <Subgroup
                key={subgroup.title ?? `__flat-${idx}`}
                subgroup={subgroup}
                pathname={pathname}
                badges={badges}
                shortcuts={shortcuts}
              />
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

function Subgroup({
  subgroup,
  pathname,
  badges,
  shortcuts,
}: {
  subgroup: NavSubgroup
  pathname: string
  badges: NavBadges
  shortcuts: NavShortcuts
}) {
  const visibleItems = subgroup.items

  const hasActive = visibleItems.some((item) => isActive(pathname, item.href))
  const hasTitle = Boolean(subgroup.title)
  const isCollapsible = subgroup.collapsible

  if (!hasTitle) {
    return (
      <SidebarMenu>
        {visibleItems.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            isActive={isActive(pathname, item.href)}
            badge={badges[item.href]}
            shortcuts={shortcuts[item.href]}
            pathname={pathname}
          />
        ))}
      </SidebarMenu>
    )
  }

  if (!isCollapsible) {
    return (
      <div className="mt-1 first:mt-0">
        <SubgroupLabel title={subgroup.title!} />
        <SidebarMenu>
          {visibleItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(pathname, item.href)}
              badge={badges[item.href]}
              shortcuts={shortcuts[item.href]}
              pathname={pathname}
            />
          ))}
        </SidebarMenu>
      </div>
    )
  }

  return (
    <Collapsible
      defaultOpen={hasActive}
      className="group/subcollapsible mt-1 first:mt-0"
    >
      <SidebarGroupLabel
        asChild
        className="cursor-pointer text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase select-none hover:text-muted-foreground"
      >
        <CollapsibleTrigger>
          <span>{subgroup.title}</span>
          <ChevronRightIcon className="ml-auto size-3 transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90" />
        </CollapsibleTrigger>
      </SidebarGroupLabel>
      <CollapsibleContent>
        <SidebarMenu>
          {visibleItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(pathname, item.href)}
              badge={badges[item.href]}
              shortcuts={shortcuts[item.href]}
              pathname={pathname}
            />
          ))}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A route is active on its own page and on any page below it (e.g. /settings/members under /settings). */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/")
}

function SubgroupLabel({ title }: { title: string }) {
  return (
    <div className="flex h-7 items-center px-2 text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
      {title}
    </div>
  )
}

function NavItem({
  item,
  isActive,
  badge,
  shortcuts,
  pathname,
}: {
  item: NavRoute
  isActive: boolean
  badge?: NavBadges[string]
  shortcuts?: NavShortcuts[string]
  pathname: string
}) {
  const t = useTranslations("shell.nav")
  const Icon = item.icon
  const [open, setOpen] = useRememberedOpen(item.href)
  const hasShortcuts = Boolean(shortcuts?.items.length)
  const showBadge = badge && badge.count > 0

  const row = (
    <>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(item.label)}
        className="data-[active=true]:font-medium"
      >
        <Link href={item.href}>
          {/* The count sits on the icon, as the notification bell's does, so it shows with the sidebar collapsed too. */}
          <span className="relative flex shrink-0">
            <Icon />
            {showBadge && (
              <CountBadge aria-hidden="true" className="-top-2 -right-2">
                {badge.count > 99 ? "99+" : badge.count}
              </CountBadge>
            )}
          </span>
          <span>{t(item.label)}</span>
          {showBadge && (
            <span className="sr-only">
              {t("pending", { count: badge.count })}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </>
  )

  if (!shortcuts || !hasShortcuts)
    return <SidebarMenuItem>{row}</SidebarMenuItem>

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        {row}
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label={shortcuts.label}
            className="data-[state=open]:rotate-90"
          >
            <ChevronRightIcon />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {shortcuts.items.map((s) => (
              <SidebarMenuSubItem key={s.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={
                    pathname === s.href || pathname.startsWith(s.href + "/")
                  }
                >
                  <Link href={s.href} title={s.title}>
                    {/* A dot on the icon's corner marks an overdue course. */}
                    <span className="relative flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                      {s.icon}
                      {s.urgent && (
                        <span
                          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-danger ring-2 ring-sidebar"
                          aria-label={t("overdue")}
                          role="img"
                        />
                      )}
                    </span>
                    <span className="min-w-0 truncate">{s.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            {shortcuts.more && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className="text-muted-foreground"
                >
                  <Link href={item.href}>
                    <span>{t("seeAll")}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

/** Open by default; remembers in this browser when someone closes it. */
function useRememberedOpen(href: string) {
  const key = `cluster:nav-open:${href}`
  const open = React.useSyncExternalStore(
    subscribeOpen,
    () => localStorage.getItem(key) !== "0",
    // The server render has no localStorage.
    () => true
  )
  const change = React.useCallback(
    (next: boolean) => {
      if (next) localStorage.removeItem(key)
      else localStorage.setItem(key, "0")
      openListeners.forEach((l) => l())
    },
    [key]
  )
  return [open, change] as const
}

const openListeners = new Set<() => void>()

function subscribeOpen(onChange: () => void) {
  openListeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    openListeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}
