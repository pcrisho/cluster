"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon, LogOutIcon, SunMoonIcon } from "lucide-react"
import { getImageUrl } from "@/lib/images"
import { useTranslations } from "next-intl"

export function NavUser({
  user,
  onLogout,
  profileHref,
}: {
  user: {
    name: string
    email: string
    initials: string
    avatarUrl: string | null
  }
  onLogout: () => void
  /** Where the user's name and photo in the menu lead. */
  profileHref: string
}) {
  const { isMobile } = useSidebar()
  const t = useTranslations("shell.user")
  const { theme, setTheme } = useTheme()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="rounded-lg data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src={getImageUrl(user.avatarUrl) || undefined}
                  className="rounded-lg"
                />
                <AvatarFallback className="rounded-lg">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem asChild className="p-0">
              <Link
                href={profileHref}
                className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={getImageUrl(user.avatarUrl) || undefined}
                    className="rounded-lg"
                  />
                  <AvatarFallback className="rounded-lg">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunMoonIcon />
                {t("theme")}
                <DropdownMenuShortcut className="mr-4">D</DropdownMenuShortcut>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme ?? "system"}
                  onValueChange={setTheme}
                >
                  <DropdownMenuRadioItem value="light">
                    {t("themeLight")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    {t("themeDark")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    {t("themeSystem")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOutIcon />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
