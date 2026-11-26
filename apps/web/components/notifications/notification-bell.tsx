"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { BellIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CountBadge } from "@/components/ui/count-badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAuth } from "@/lib/auth-context"
import { useNotifications } from "@/lib/use-notifications"
import { NotificationList } from "./notification-list"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export function NotificationBell() {
  const t = useTranslations("notifications")
  const { isAuthenticated } = useAuth()
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
    refresh,
  } = useNotifications(isAuthenticated)
  const [open, setOpen] = useState(false)
  // Opening a notification navigates; the popover closes with the page it was opened on.
  const pathname = usePathname()
  const [openedOn, setOpenedOn] = useState(pathname)
  if (pathname !== openedOn) {
    setOpenedOn(pathname)
    setOpen(false)
  }

  if (!isAuthenticated) return null

  const handleMarkRead = async (id: string) => {
    try {
      await markRead(id)
    } catch (err) {
      toast.error(
        (err instanceof Error && getErrorMessage(err)) || t("markFailed")
      )
      throw err
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("title")}
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <CountBadge className="-top-0.5 -right-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </CountBadge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">{t("title")}</h3>
        </div>
        <NotificationList
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={isLoading}
          error={error}
          onMarkRead={handleMarkRead}
          onMarkAllRead={markAllRead}
          onRetry={refresh}
        />
      </PopoverContent>
    </Popover>
  )
}
