"use client"

import { type ReactNode } from "react"
import { ShieldXIcon } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useTranslations } from "next-intl"

export function RequireAdmin({ children }: { children: ReactNode }) {
  const t = useTranslations("settings.pages")
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  if (!isAdmin) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldXIcon />
          </EmptyMedia>
          <EmptyTitle>{t("restricted")}</EmptyTitle>
          <EmptyDescription>{t("adminsOnly")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return <>{children}</>
}
