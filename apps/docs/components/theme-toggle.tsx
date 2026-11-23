"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react"

const ORDER = ["light", "dark", "system"] as const

function subscribeNoop() {
  return () => {}
}

export function ThemeToggle() {
  const t = useTranslations("chrome")
  const { theme, setTheme } = useTheme()
  // Server and first client render agree (no icon until mounted), without a state update in an effect.
  const mounted = React.useSyncExternalStore(subscribeNoop, () => true, () => false)
  const current = (ORDER as readonly string[]).includes(theme ?? "") ? theme! : "system"
  const next = ORDER[(ORDER.indexOf(current as (typeof ORDER)[number]) + 1) % ORDER.length]
  const label = current === "light" ? t("themeLight") : current === "dark" ? t("themeDark") : t("themeSystem")
  const Icon = !mounted ? MonitorIcon : current === "light" ? SunIcon : current === "dark" ? MoonIcon : MonitorIcon
  return (
    <Button variant="ghost" size="icon" aria-label={`${t("theme")}: ${label}`} title={`${t("theme")}: ${label}`} onClick={() => setTheme(next)}>
      <Icon aria-hidden />
    </Button>
  )
}
