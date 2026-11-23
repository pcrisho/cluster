"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { MembersPanel } from "@/components/settings/members-panel"
import { useTranslations } from "next-intl"

export default function MembersPage() {
  const t = useTranslations("settings.pages")
  return (
    <PageContainer width="wide">
      <RequireAdmin>
        <PageHeader
          title={t("membersTitle")}
          description={t("membersDescription")}
        />
        <MembersPanel />
      </RequireAdmin>
    </PageContainer>
  )
}
