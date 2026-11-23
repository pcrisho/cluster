import { useTranslations } from "next-intl"
import { DocsHeader } from "@/components/docs-header"
import { DocsNav } from "@/components/docs-nav"
import { MenuEscape } from "@/components/menu-escape"
import type { TocItem } from "@/lib/toc"
import type { NavSection } from "@/lib/nav"

// The page frame: header, section tree (sidebar, or a menu below 1024 px), content and the
// "On this page" list from 1280 px. Plain HTML: the menu is a <details>, no script needed.
export function DocsShell({
  locale,
  nav,
  current,
  toc = [],
  children,
}: {
  locale: string
  nav: NavSection[]
  current?: string
  toc?: TocItem[]
  children: React.ReactNode
}) {
  const t = useTranslations("chrome")
  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        {t("skipToContent")}
      </a>
      <DocsHeader locale={locale} nav={nav} />
      <MenuEscape />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_14rem]">
        <aside className="sticky top-16 hidden max-h-[calc(100vh-4rem)] overflow-y-auto py-8 lg:block">
          <DocsNav locale={locale} nav={nav} current={current} />
        </aside>
        <details className="border-b border-border py-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium text-foreground">{t("menu")}</summary>
          <div className="pt-4">
            <DocsNav locale={locale} nav={nav} current={current} />
          </div>
        </details>
        <main id="content" className="min-w-0 py-8">
          {toc.length > 0 ? (
            <details className="mb-6 rounded-lg border border-border px-4 py-3 xl:hidden">
              <summary className="cursor-pointer text-sm font-medium text-foreground">{t("onThisPage")}</summary>
              <div className="pt-3">
                <TocNav label={t("onThisPage")} toc={toc} hideLabel />
              </div>
            </details>
          ) : null}
          {children}
        </main>
        {toc.length > 0 ? (
          <aside className="sticky top-16 hidden max-h-[calc(100vh-4rem)] overflow-y-auto py-8 xl:block">
            <TocNav label={t("onThisPage")} toc={toc} />
          </aside>
        ) : null}
      </div>
    </>
  )
}

function TocNav({ label, toc, hideLabel }: { label: string; toc: TocItem[]; hideLabel?: boolean }) {
  return (
    <nav aria-label={label} className="text-sm">
      {hideLabel ? null : <p className="mb-2 font-medium text-foreground">{label}</p>}
      <ul className="flex flex-col gap-1">
        {toc.map((item) => (
          <li key={item.id} className={item.depth === 3 ? "pl-3" : undefined}>
            <a href={`#${item.id}`} className="block py-0.5 text-muted-foreground hover:text-foreground">
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
