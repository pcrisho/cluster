"use client"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { ProfilePanel } from "@/components/settings/profile-panel"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SecurityCard } from "@/components/settings/security-card"
import { SessionsCard } from "@/components/settings/sessions-card"
import { useAuth } from "@/lib/auth-context"
import { useTranslations } from "next-intl"

export default function AccountPage() {
  const t = useTranslations("settings.pages")
  const { user } = useAuth()
  if (!user) return null

  return (
    <PageContainer>
      <PageHeader
        title={t("accountTitle")}
        description={t("accountDescription")}
      />
      <ProfilePanel user={user} />
      <ChangePasswordCard />
      <SecurityCard />
      {/* Turning 2FA on or off signs out the other sessions: list them again. */}
      <SessionsCard key={String(user.mfaEnabled)} />
    </PageContainer>
  )
}
