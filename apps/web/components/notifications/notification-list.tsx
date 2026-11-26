"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { NotificationItem } from "./notification-item"
import { NotificationEmpty } from "./notification-empty"
import type { Notification } from "@/lib/notifications-api"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

interface NotificationListProps {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  onMarkRead: (id: string) => Promise<void>
  onMarkAllRead: () => Promise<void>
  onRetry: () => Promise<void>
}

export function NotificationList({
  notifications,
  unreadCount,
  isLoading,
  error,
  onMarkRead,
  onMarkAllRead,
  onRetry,
}: NotificationListProps) {
  const t = useTranslations("notifications")
  const [markingAll, setMarkingAll] = useState(false)

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await onMarkAllRead()
    } catch (err) {
      toast.error(
        (err instanceof Error && getErrorMessage(err)) || t("markAllFailed")
      )
    } finally {
      setMarkingAll(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5">
            <Skeleton className="mt-0.5 size-5 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="p-2">
        <NotificationEmpty />
      </div>
    )
  }

  return (
    <div className="flex max-h-[420px] flex-col">
      <div className="flex-1 overflow-y-auto p-1">
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onMarkRead={onMarkRead}
          />
        ))}
      </div>
      {unreadCount > 0 && (
        <>
          <Separator />
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleMarkAll}
              disabled={markingAll}
            >
              {markingAll ? t("marking") : t("markAll")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
