"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { EMPTY_SEEDS, parseSeeds, type Seeds } from "@cluster/theme"

import { Skeleton } from "@/components/ui/skeleton"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { adminApi } from "@/lib/admin-api"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { orgApi } from "@/lib/org-api"

/**
 * The organization's own theme over the instance's. Saving re-reads the signed-in user, whose
 * theme the auth context writes to the theme cookie before refreshing, so the admin sees it at once.
 */
export function OrganizationAppearancePanel() {
  const t = useTranslations("settings.appearance")
  const { user, refreshUser } = useAuth()
  const [baseline, setBaseline] = useState<Seeds | null>(null)

  useEffect(() => {
    adminApi
      .getPublicInstance()
      .then((i) => setBaseline(parseSeeds(i.theme) ?? EMPTY_SEEDS))
      .catch(() => setBaseline(EMPTY_SEEDS))
  }, [])

  if (!user || !baseline) return <Skeleton className="h-96 w-full" />

  return (
    <AppearancePanel
      scope="organization"
      saved={user.organization.theme ?? EMPTY_SEEDS}
      baseline={baseline}
      disabledReason={
        user.organization.themingAllowed ? undefined : t("disabled")
      }
      onSave={async (seeds) => {
        try {
          await orgApi.updateTheme(seeds)
        } catch (err) {
          // Switched off meanwhile: re-reading the user turns the page into the disabled state.
          if (err instanceof ApiError && err.code === "ORG_THEMING_DISABLED")
            await refreshUser()
          throw err
        }
        await refreshUser()
      }}
    />
  )
}
