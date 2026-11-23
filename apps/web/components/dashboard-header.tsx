"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbEllipsis,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import {
  useBreadcrumb,
  type BreadcrumbItem as Crumb,
} from "@/lib/breadcrumb-context"
import { useTranslations } from "next-intl"
import type { Messages } from "@/lib/i18n/messages"

/** Module names are product names: the same in every language. */
const MODULE_NAMES: Record<string, string> = {
  connect: "Connect",
  know: "Know",
  grow: "Grow",
  life: "Life",
}

type SegmentKey = keyof Messages["shell"]["breadcrumb"]
const isSegmentKey = (segment: string): segment is SegmentKey =>
  [
    "directory",
    "spaces",
    "search",
    "settings",
    "account",
    "organization",
    "members",
    "areas",
    "positions",
    "assignments",
    "instance",
    "feed",
    "activity",
    "appearance",
  ].includes(segment)

/** From this many crumbs on, the middle ones collapse into a dropdown. */
const MAX_VISIBLE = 4

export function DashboardHeader() {
  const t = useTranslations("shell.breadcrumb")
  const tUi = useTranslations("ui")
  const label = (segment: string) =>
    MODULE_NAMES[segment] ??
    (isSegmentKey(segment)
      ? t(segment)
      : segment.charAt(0).toUpperCase() + segment.slice(1))
  const pathname = usePathname()
  const { items: contextItems } = useBreadcrumb()
  const segments = pathname.split("/").filter(Boolean)
  const currentModule = segments[0] ?? ""

  // Use context breadcrumbs only if the module matches the current route.
  // Otherwise fall back to path-based breadcrumbs (handles cross-module navigation).
  const firstContextLabel = contextItems[0]?.label?.toLowerCase() ?? ""
  const moduleName = MODULE_NAMES[currentModule]
  const moduleMatch = moduleName?.toLowerCase() === firstContextLabel

  // Context crumbs only when they belong to the current module; otherwise build
  // them from the path (handles cross-module navigation).
  const crumbs: Crumb[] =
    contextItems.length > 0 && moduleMatch
      ? contextItems
      : [
          { label: label(currentModule), href: `/${currentModule}` },
          ...(segments[1] ? [{ label: label(segments[1]) }] : []),
        ]
  const collapsed = crumbs.length > MAX_VISIBLE
  const hidden = collapsed ? crumbs.slice(1, -2) : []
  const visible = collapsed ? [crumbs[0], ...crumbs.slice(-2)] : crumbs

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="my-auto mr-2 h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {visible.map((item, i) => {
              const isLast = i === visible.length - 1
              return (
                <Fragment key={`${i}-${item.label}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem
                    className={cn(
                      "min-w-0",
                      i === 0 && "shrink-0",
                      isLast && i > 0 && "max-w-[55%] shrink-0"
                    )}
                  >
                    {!isLast && item.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={item.href} className="truncate">
                          {item.label}
                        </Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate">
                        {item.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {i === 0 && collapsed && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="flex items-center rounded-sm hover:text-foreground"
                            aria-label={tUi("more")}
                          >
                            <BreadcrumbEllipsis />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="w-max max-w-72"
                          >
                            {hidden.map((h, j) => (
                              <DropdownMenuItem
                                key={`${j}-${h.label}`}
                                asChild={!!h.href}
                              >
                                {h.href ? (
                                  <Link href={h.href}>{h.label}</Link>
                                ) : (
                                  h.label
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </BreadcrumbItem>
                    </>
                  )}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3 pr-4">
        <NotificationBell />
      </div>
    </header>
  )
}
