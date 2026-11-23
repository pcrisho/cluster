"use client"

import { useState, useEffect, useCallback } from "react"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { FieldGroup } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
// Known exception: shown only when CONNECT is enabled for the organization.
// eslint-disable-next-line no-restricted-imports
import { connectApi } from "@/lib/connect-api"
import { useTranslations } from "next-intl"

export function CelebrationsPanel() {
  const t = useTranslations("settings.celebrations")
  const [settings, setSettings] = useState<{
    celebrationsEnabled: boolean
    showBirthdays: boolean
    showAnniversaries: boolean
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await connectApi.getCelebrationsSettings()
      setSettings(result.data)
    } catch {
      toast.error(t("loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    queueMicrotask(() => {
      void loadSettings()
    })
  }, [loadSettings])

  const toggle = useCallback(
    async (field: string, value: boolean) => {
      if (!settings) return
      const prev = { ...settings }
      setSettings((s) => (s ? { ...s, [field]: value } : s))
      setIsSaving(true)
      try {
        await connectApi.updateCelebrationsSettings({ [field]: value })
        toast.success(t("updated"))
      } catch {
        setSettings(prev)
        toast.error(t("updateFailed"))
      } finally {
        setIsSaving(false)
      }
    },
    [settings, t]
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!settings) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("unavailable")}
      </p>
    )
  }

  return (
    <FieldGroup>
      <div className="flex items-center gap-2 rounded-lg border p-4">
        <SparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">{t("celebrations")}</p>
          <p className="text-xs text-muted-foreground">
            {t("celebrationsHint")}
          </p>
        </div>
        <Switch
          checked={settings.celebrationsEnabled}
          onCheckedChange={(v) => toggle("celebrationsEnabled", v)}
          disabled={isSaving}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border p-4">
        <span className="size-5 shrink-0 text-center text-base">🎂</span>
        <div className="flex-1">
          <p className="text-sm font-medium">{t("birthdays")}</p>
          <p className="text-xs text-muted-foreground">{t("birthdaysHint")}</p>
        </div>
        <Switch
          checked={settings.showBirthdays}
          onCheckedChange={(v) => toggle("showBirthdays", v)}
          disabled={isSaving || !settings.celebrationsEnabled}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border p-4">
        <span className="size-5 shrink-0 text-center text-base">🎉</span>
        <div className="flex-1">
          <p className="text-sm font-medium">{t("anniversaries")}</p>
          <p className="text-xs text-muted-foreground">
            {t("anniversariesHint")}
          </p>
        </div>
        <Switch
          checked={settings.showAnniversaries}
          onCheckedChange={(v) => toggle("showAnniversaries", v)}
          disabled={isSaving || !settings.celebrationsEnabled}
        />
      </div>
    </FieldGroup>
  )
}
