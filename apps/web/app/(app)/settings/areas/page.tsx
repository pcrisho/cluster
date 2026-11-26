"use client"

import { useSearchParams } from "next/navigation"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { AreasPanel } from "@/components/settings/areas-panel"
import { useTranslations } from "next-intl"

export default function AreasPage() {
  const t = useTranslations("settings.pages")
  const main = useSearchParams().get("view") === "main"
  return (
    <PageContainer width="full" className="flex flex-1 flex-col">
      <RequireAdmin>
        <PageHeader
          title={t("areasTitle")}
          description={t(main ? "mainNodesDescription" : "areasDescription")}
        />
        <div className="min-h-0 flex-1">
          <AreasPanel />
        </div>
      </RequireAdmin>
    </PageContainer>
  )
}
