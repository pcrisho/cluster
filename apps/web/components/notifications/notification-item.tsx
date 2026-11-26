"use client"

import { useRouter } from "next/navigation"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Notification } from "@/lib/notifications-api"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"
import { notificationText } from "@/lib/notification-text"

interface NotificationItemProps {
  notification: Notification
  onMarkRead: (id: string) => Promise<void>
}

export function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const dates = useDates()
  const t = useTranslations("notifications")
  const tType = useTranslations("notifications.types")
  const text = notificationText(notification, {
    has: (key) => tType.has(key as Parameters<typeof tType.has>[0]),
    t: (key, params) => tType(key as Parameters<typeof tType>[0], params),
  })
  const router = useRouter()
  const isUnread = !notification.readAt

  const handleClick = async () => {
    try {
      await onMarkRead(notification.id)
    } catch {
      return
    }
    if (notification.link) {
      router.push(notification.link)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        isUnread && "bg-muted/30"
      )}
    >
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        {isUnread ? (
          <span
            className="size-2 rounded-full bg-primary"
            aria-label={t("unread")}
          />
        ) : (
          <CheckIcon className="size-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className={cn(
            "truncate text-sm",
            isUnread ? "font-semibold" : "font-medium text-muted-foreground"
          )}
        >
          {text.title}
        </p>
        {text.body && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {text.body}
          </p>
        )}
        <p className="text-3xs text-muted-foreground">
          {dates.relative(notification.createdAt)}
        </p>
      </div>
    </button>
  )
}
