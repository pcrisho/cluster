import Link from "next/link"
import { useTranslations } from "next-intl"
import { DocsSearch } from "@/components/docs-search"
import { LanguageSwitch } from "@/components/language-switch"
import { ThemeToggle } from "@/components/theme-toggle"
import type { NavSection } from "@/lib/nav"

export function DocsHeader({ locale, nav = [] }: { locale: string; nav?: NavSection[] }) {
  const t = useTranslations("chrome")
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${locale}/`} className="font-semibold tracking-tight text-foreground">
          Cluster <span className="font-normal text-muted-foreground">{t("home")}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <DocsSearch locale={locale} nav={nav} />
          {siteUrl ? (
            <a href={siteUrl} className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
              {t("backToSite")}
            </a>
          ) : null}
          <LanguageSwitch locale={locale} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
