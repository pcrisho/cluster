import { BellIcon, PanelLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export type AppCrumb = {
  label: string
  current?: boolean
}

export function AppHeader({ crumbs }: { crumbs: AppCrumb[] }) {
  const t = useTranslations("mocks.chrome")

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <PanelLeftIcon className="size-4 shrink-0 text-foreground" aria-hidden />
      <span className="h-5 border-l border-border" aria-hidden />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {crumbs.map((crumb, index) => (
          <div
            className="flex min-w-0 items-center gap-2"
            key={`${crumb.label}-${index}`}
          >
            {index > 0 && (
              <span className="text-muted-foreground" aria-hidden>
                ›
              </span>
            )}
            <span
              className={
                crumb.current
                  ? "truncate font-medium text-foreground"
                  : "truncate text-muted-foreground"
              }
            >
              {crumb.label}
            </span>
          </div>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-4 text-muted-foreground">
        <BellIcon className="size-5" aria-hidden />
        <span className="sr-only">{t("notifications")}</span>
      </div>
    </div>
  )
}
