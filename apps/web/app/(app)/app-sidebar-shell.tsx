"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { BreadcrumbProvider } from "@/lib/breadcrumb-context"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { GlobalCommandMenu } from "@/components/global-command-menu"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { FeedSkeleton } from "@/components/connect/feed-skeleton"
import {
  PositionsPageSkeleton,
  OrgAssignPageSkeleton,
} from "@/components/settings/settings-skeletons"
import { PageEmpty } from "@/components/layout/page"
import { moduleForPath } from "@/lib/modules"
import type { AuthUser } from "@/lib/api"
import { BlocksIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const PLACEHOLDER_USER: AuthUser = {
  id: "",
  email: "",
  firstName: "",
  lastName: "",
  role: "COLLABORATOR",
  avatarUrl: null,
  locale: null,
  effectiveLocale: "en",
  isSuperAdmin: false,
  organizationId: "",
  organization: {
    id: "",
    name: "",
    slug: "",
    timezone: "UTC",
    logoUrl: null,
    locale: null,
    theme: null,
    themingAllowed: false,
    memberProfileEditing: true,
    isolated: false,
  },
  modules: [],
  capabilities: [],
  managesArea: false,
  mfaEnabled: false,
  recoveryCodesLeft: null,
  mfaRequired: false,
}

const ROUTE_SKELETONS: Record<string, ReactNode> = {
  "/connect/feed": <FeedSkeleton />,
  "/settings/positions": <PositionsPageSkeleton />,
  "/settings/assignments": <OrgAssignPageSkeleton />,
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export function AppSidebarShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const t = useTranslations("shell")
  const router = useRouter()
  const pathname = usePathname()
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setHasHydrated(true))
  }, [])

  useEffect(() => {
    if (hasHydrated && !isLoading && !isAuthenticated) {
      router.push("/login")
    }
  }, [hasHydrated, isLoading, isAuthenticated, router])

  const skeleton = ROUTE_SKELETONS[pathname] ?? <DefaultSkeleton />

  // The server and the first client render share only the skeleton. The shell's Radix ids depend
  // on the tree above them, which can differ between the two renders, so it mounts after hydration.
  if (!hasHydrated) {
    return <div className="flex min-h-svh w-full">{skeleton}</div>
  }

  if (!isLoading && !isAuthenticated) return null

  // Routes of a disabled module render a notice instead of failing with 403s.
  const routeModule = moduleForPath(pathname)
  const moduleDisabled =
    !!user && !!routeModule && !user.modules.includes(routeModule)

  return (
    <SidebarProvider>
      <AppSidebar user={user || PLACEHOLDER_USER} />
      {/* min-w-0: a wide table scrolls inside its box instead of pushing the page sideways. */}
      <SidebarInset className="min-w-0">
        <BreadcrumbProvider>
          <DashboardHeader />
          <div className="flex flex-1 flex-col pt-0">
            {isLoading ? (
              skeleton
            ) : moduleDisabled ? (
              <PageEmpty
                icon={<BlocksIcon className="size-6 text-muted-foreground" />}
                className="m-6"
                title={t("moduleDisabledTitle")}
                description={t("moduleDisabledDescription")}
              />
            ) : (
              children
            )}
          </div>
        </BreadcrumbProvider>
      </SidebarInset>
      <GlobalCommandMenu />
    </SidebarProvider>
  )
}
