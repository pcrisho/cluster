"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { PositionPanel } from "@/components/settings/position-panel"
import { useTranslations } from "next-intl"

export default function PositionsPage() {
  const t = useTranslations("settings.pages")
  return (
    <PageContainer width="wide">
      <RequireAdmin>
        <PageHeader
          title={t("positionsTitle")}
          description={t("positionsDescription")}
        />
        <PositionPanel />
      </RequireAdmin>
    </PageContainer>
  )
}
