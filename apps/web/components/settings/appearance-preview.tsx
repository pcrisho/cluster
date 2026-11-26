"use client"

import type { CSSProperties } from "react"
import { useTranslations } from "next-intl"
import type { Seeds, Theme } from "@cluster/theme"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { previewVars } from "@/lib/theme/appearance-form"
import { cn } from "@/lib/utils"

/**
 * One theme on a sample card. The variables are set inline on the card, so only the card
 * changes; `dark` on the dark card makes its `dark:` variants apply without touching the app, and
 * `data-force-light` keeps them off the light card when the app itself is dark.
 */
export function AppearancePreview({
  seeds,
  theme,
}: {
  seeds: Seeds
  theme: Theme
}) {
  const t = useTranslations("settings.appearance.preview")
  const font = `var(--font-${seeds.fontKey ?? "inter"})`
  const style = {
    ...previewVars(seeds, theme),
    "--font-sans": font,
    fontFamily: font,
  } as CSSProperties
  const inputId = `appearance-preview-${theme}`

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-xs text-muted-foreground">
        {t(theme)}
      </figcaption>
      <div
        style={style}
        // Not focusable: the sample controls are for looking, not for using.
        inert
        data-force-light={theme === "light" ? "" : undefined}
        className={cn(
          "flex flex-col gap-4 rounded-xl border bg-background p-4 text-foreground",
          theme === "dark" && "dark"
        )}
      >
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold">{t("title")}</p>
            <Badge>{t("badge")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              {t("inputLabel")}
            </label>
            <Input id={inputId} placeholder={t("inputPlaceholder")} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t("primary")}</Button>
            <Button size="sm" variant="secondary">
              {t("secondary")}
            </Button>
            <Badge variant="secondary">{t("chip")}</Badge>
            <span className="text-sm text-primary underline underline-offset-4">
              {t("link")}
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}
