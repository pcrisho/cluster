"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { OrganizationAppearancePanel } from "@/components/settings/organization-appearance-panel"
import { useTranslations } from "next-intl"

export default function AppearanceSettingsPage() {
  const t = useTranslations("settings.pages")
  return (
    <PageContainer>
      <RequireAdmin>
        <PageHeader
          title={t("appearanceTitle")}
          description={t("appearanceDescription")}
        />
        <OrganizationAppearancePanel />
      </RequireAdmin>
    </PageContainer>
  )
}
