"use client"

import { ShieldXIcon } from "lucide-react"

import { PageContainer, PageEmpty, PageHeader } from "@/components/layout/page"
import { InstancePanel } from "@/components/instance/instance-panel"
import { useAuth } from "@/lib/auth-context"
import { useTranslations } from "next-intl"

export default function InstancePage() {
  const t = useTranslations("settings.pages")
  const { user } = useAuth()

  return (
    <PageContainer width="wide">
      {user?.isSuperAdmin ? (
        <>
          <PageHeader
            title={t("instanceTitle")}
            description={t("instanceDescription")}
          />
          <InstancePanel />
        </>
      ) : (
        <PageEmpty
          icon={<ShieldXIcon className="size-6 text-muted-foreground" />}
          title={t("restricted")}
          description={t("instanceOnly")}
        />
      )}
    </PageContainer>
  )
}
