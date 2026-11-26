"use client"

import { useSyncExternalStore } from "react"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Kbd } from "@/components/ui/kbd"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { openCommandMenu } from "@/lib/command-menu"

const noSubscribe = () => () => {}
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** The sidebar's way into the command menu, with the shortcut it also answers to. */
export function SidebarSearch() {
  const t = useTranslations("shell.search")
  // The server cannot know the platform: render Ctrl K, switch to ⌘ K once on the client.
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false)
  return (
    <SidebarGroup className="pb-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            variant="outline"
            tooltip={t("label")}
            onClick={openCommandMenu}
            className="text-muted-foreground"
          >
            <SearchIcon />
            <span>{t("label")}</span>
            <Kbd className="ml-auto hidden bg-sidebar-accent md:inline-flex">
              {apple ? "⌘ K" : "Ctrl K"}
            </Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
