"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { OrganizationPanel } from "@/components/settings/organization-panel"
import { useTranslations } from "next-intl"

export default function OrganizationSettingsPage() {
  const t = useTranslations("settings.pages")
  return (
    <PageContainer>
      <RequireAdmin>
        <PageHeader
          title={t("organizationTitle")}
          description={t("organizationDescription")}
        />
        <OrganizationPanel />
      </RequireAdmin>
    </PageContainer>
  )
}
