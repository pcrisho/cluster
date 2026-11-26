import { useTranslations } from "next-intl"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { GrowTabs } from "@/components/grow/grow-tabs"

/** The Learning module's tabbed pages; the course editor and player have their own full-height layouts. */
export default function GrowTabsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations("grow")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t("learningTitle")}
          description={t("learningDescription")}
        />
        <GrowTabs />
      </div>
      {children}
    </PageContainer>
  )
}
