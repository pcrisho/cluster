import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { DocsShell } from "@/components/docs-shell"
import { listPages } from "@/lib/content"
import { buildNav } from "@/lib/nav"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "chrome" })
  return {
    title: `${t("home")} · Cluster`,
    description: t("intro"),
    alternates: { canonical: `/${locale}/`, languages: { en: "/en/", es: "/es/", "x-default": "/en/" } },
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("chrome")
  const tSections = await getTranslations("sections")
  const nav = buildNav(listPages(locale))
  return (
    <DocsShell locale={locale} nav={nav}>
      <article data-pagefind-body className="docs-prose max-w-[72ch]">
        <h1>{t("home")}</h1>
        <p className="lead">{t("intro")}</p>
        {nav.map(({ section, items }) => (
          <section key={section} aria-labelledby={`s-${section}`}>
            <h2 id={`s-${section}`}>{tSections(section)}</h2>
            <ul>
              {items.map((p) => (
                <li key={p.path}>
                  <Link href={`/${locale}/${p.path}/`}>{p.frontmatter.title}</Link>
                  <span className="text-muted-foreground"> — {p.frontmatter.description ?? ""}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </DocsShell>
  )
}
