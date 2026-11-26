"use client"

import { useTranslations } from "next-intl"
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react"
import type { Seeds, Theme } from "@cluster/theme"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { StatusBadge } from "@/components/ui/status-badge"
import { contrastRows } from "@/lib/theme/appearance-form"

const THEMES: Theme[] = ["light", "dark"]

/** Every pair a brand seed touches, with its ratio, in both themes. */
export function AppearanceContrast({ seeds }: { seeds: Seeds }) {
  const t = useTranslations("settings.appearance.contrast")
  const rows = THEMES.map((theme) => ({
    theme,
    rows: contrastRows(seeds, theme),
  }))
  const all = rows.flatMap((r) => r.rows)

  return (
    <Collapsible className="group/contrast flex flex-col gap-3">
      <CollapsibleTrigger className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRightIcon
          aria-hidden
          className="size-4 transition-transform group-data-[state=open]/contrast:rotate-90"
        />
        {t("title")}
        <span className="font-normal text-muted-foreground">
          {t("summary", {
            passed: all.filter((r) => r.pass).length,
            total: all.length,
          })}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 md:grid-cols-2">
        {rows.map(({ theme, rows }) => (
          <div key={theme} className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t(theme)}</p>
            <ul className="flex flex-col gap-1.5">
              {rows.map((row) => {
                // A translucent fill reads as Tailwind writes it: `primary/80`.
                const bg = row.alpha
                  ? `${row.bg}/${Math.round(row.alpha * 100)}`
                  : row.bg
                const label = row.base
                  ? t("pairOver", { fg: row.fg, bg, base: row.base })
                  : t("pair", { fg: row.fg, bg })
                return (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 font-mono text-xs break-words">
                      {label}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums">
                        {t("ratio", { ratio: row.ratio.toFixed(2) })}
                      </span>
                      <StatusBadge
                        tone={row.pass ? "success" : "danger"}
                        icon={row.pass ? CheckIcon : XIcon}
                      >
                        {row.pass ? t("pass") : t("fail")}
                      </StatusBadge>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
