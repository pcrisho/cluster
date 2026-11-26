"use client"

import type { CSSProperties } from "react"
import { useTranslations } from "next-intl"
import type { GlassKey, Seeds, Theme } from "@cluster/theme"

import { Button } from "@/components/ui/button"
import { glassPreviewVars, previewVars } from "@/lib/theme/appearance-form"
import { cn } from "@/lib/utils"

// The same look the app gives its glass surfaces (the block in globals.css), on variables set
// inline on the card, so only the preview changes.
const SURFACE: CSSProperties = {
  backgroundColor:
    "color-mix(in srgb, var(--popover) calc(var(--glass-alpha) * 100%), transparent)",
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
}

const AMBIENT: CSSProperties = {
  backgroundImage:
    "radial-gradient(24rem 14rem at 0% 0%, color-mix(in srgb, var(--primary) calc(var(--glass-tint) * 100%), transparent), transparent 70%)," +
    "radial-gradient(20rem 14rem at 100% 100%, color-mix(in srgb, var(--primary) calc(var(--glass-tint) * 60%), transparent), transparent 70%)",
}

const MENU_ITEMS = ["menuOpen", "menuRename", "menuShare"] as const

/** A menu and a dialog over a page of content, in one theme, with the chosen glass level (null = Off). */
export function AppearanceGlassPreview({
  seeds,
  theme,
  glass,
}: {
  seeds: Seeds
  theme: Theme
  glass: GlassKey | null
}) {
  const t = useTranslations("settings.appearance.glass.preview")
  const tp = useTranslations("settings.appearance.preview")
  const font = `var(--font-${seeds.fontKey ?? "inter"})`
  const style = {
    ...previewVars(seeds, theme),
    ...glassPreviewVars(glass, seeds, theme),
    "--font-sans": font,
    fontFamily: font,
  } as CSSProperties

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-xs text-muted-foreground">
        {tp(theme)}
      </figcaption>
      <div
        style={{ ...style, ...AMBIENT }}
        // Not focusable: the sample is for looking, not for using.
        inert
        data-force-light={theme === "light" ? "" : undefined}
        role="img"
        aria-label={t("caption")}
        className={cn(
          "relative h-64 overflow-hidden rounded-xl border bg-background text-foreground",
          theme === "dark" && "dark"
        )}
      >
        {/* The page behind: bars of colour and text, so the blur has something to blur. */}
        <div className="flex flex-col gap-3 p-4" aria-hidden>
          <div className="h-8 w-2/3 rounded-lg bg-primary" />
          <div className="h-3 w-full rounded-full bg-foreground/60" />
          <div className="h-3 w-5/6 rounded-full bg-foreground/40" />
          <div className="flex gap-3">
            <div className="h-16 flex-1 rounded-lg bg-cat-2" />
            <div className="h-16 flex-1 rounded-lg bg-cat-4" />
          </div>
        </div>
        <div
          style={SURFACE}
          className="absolute top-3 right-3 flex w-36 flex-col rounded-lg p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {MENU_ITEMS.map((key, i) => (
            <span
              key={key}
              className={cn(
                "rounded-md px-1.5 py-1",
                i === 0 && "bg-accent text-accent-foreground"
              )}
            >
              {t(key)}
            </span>
          ))}
        </div>
        <div
          style={SURFACE}
          className="absolute bottom-3 left-3 flex w-56 max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-xl p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <p className="font-medium">{t("dialogTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("dialogBody")}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline">
              {t("dialogCancel")}
            </Button>
            <Button size="sm">{t("dialogConfirm")}</Button>
          </div>
        </div>
      </div>
    </figure>
  )
}
