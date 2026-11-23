import Link from "next/link"
import { useTranslations } from "next-intl"
import type { NavPage } from "@/lib/nav"

export function DocsPager({ locale, prev, next }: { locale: string; prev?: NavPage; next?: NavPage }) {
  const t = useTranslations("chrome")
  if (!prev && !next) return null
  return (
    <nav aria-label="pagination" className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={`/${locale}/${prev.path}/`} className="rounded-xl border border-border p-4 hover:bg-muted">
          <span className="block text-sm text-muted-foreground">{t("previous")}</span>
          <span className="font-medium text-foreground">{prev.frontmatter.title}</span>
        </Link>
      ) : <span />}
      {next ? (
        <Link href={`/${locale}/${next.path}/`} className="rounded-xl border border-border p-4 text-right hover:bg-muted sm:col-start-2">
          <span className="block text-sm text-muted-foreground">{t("next")}</span>
          <span className="font-medium text-foreground">{next.frontmatter.title}</span>
        </Link>
      ) : null}
    </nav>
  )
}
