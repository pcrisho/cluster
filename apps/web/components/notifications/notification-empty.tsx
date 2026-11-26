"use client"

import { BellOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function NotificationEmpty() {
  const t = useTranslations("notifications")
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="rounded-full bg-muted p-3">
        <BellOffIcon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{t("emptyTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("emptyBody")}</p>
    </div>
  )
}
