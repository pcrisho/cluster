"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { ActivityPanel } from "@/components/settings/activity-panel"
import { useTranslations } from "next-intl"

export default function ActivityPage() {
  const t = useTranslations("settings.pages")
  return (
    <PageContainer>
      <RequireAdmin>
        <PageHeader
          title={t("activityTitle")}
          description={t("activityDescription")}
        />
        <ActivityPanel />
      </RequireAdmin>
    </PageContainer>
  )
}
