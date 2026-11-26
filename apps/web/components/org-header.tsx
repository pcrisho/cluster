"use client"

import { Building2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { UserRole } from "@/lib/api"
import { getImageUrl } from "@/lib/images"

/** Sidebar header: the user's organization (one organization per user), with its logo when it has one. */
export function OrgHeader({
  name,
  role,
  logoUrl,
}: {
  name: string
  role: UserRole
  logoUrl: string | null
}) {
  const t = useTranslations("common.roles")
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="pointer-events-none rounded-lg"
        >
          <Avatar className="size-8 rounded-lg after:rounded-lg">
            <AvatarImage
              src={getImageUrl(logoUrl) ?? undefined}
              alt=""
              className="rounded-lg bg-card object-contain"
            />
            <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2Icon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-xs">{t(role)}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
