import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { routing } from "@/i18n/routing"
import { Callout } from "@/components/callout"
import { DocsPager } from "@/components/docs-pager"
import { DocsShell } from "@/components/docs-shell"
import { listPages } from "@/lib/content"
import { DocBody } from "@/lib/docs-markdown"
import { buildNav, neighbours } from "@/lib/nav"
import { getSecurityContact } from "@/lib/security-contact"
import { extractToc } from "@/lib/toc"

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    listPages(locale).map((p) => ({ locale, slug: p.path.split("/") }))
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const page = listPages(locale).find((p) => p.path === slug.join("/"))
  if (!page) return {}
  return {
    title: `${page.frontmatter.title} · Cluster`,
    description: page.frontmatter.description,
    alternates: {
      canonical: `/${locale}/${page.path}/`,
      languages: {
        en: `/en/${page.path}/`,
        es: `/es/${page.path}/`,
        "x-default": `/en/${page.path}/`,
      },
    },
  }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const pages = listPages(locale)
  const page = pages.find((p) => p.path === slug.join("/"))
  if (!page) notFound()
  const nav = buildNav(pages)
  const { prev, next } = neighbours(nav, page.path)
  const tSections = await getTranslations({ locale, namespace: "sections" })
  const tChrome = await getTranslations({ locale, namespace: "chrome" })
  const securityContact = page.path === "help/security-policy" ? getSecurityContact() : undefined
  return (
    <DocsShell locale={locale} nav={nav} current={page.path} toc={extractToc(page.body)}>
      <article data-pagefind-body className="docs-prose max-w-[72ch]">
        <span className="sr-only" data-pagefind-meta="section">
          {tSections(page.frontmatter.section)}
        </span>
        <h1>{page.frontmatter.title}</h1>
        <p className="lead">{page.frontmatter.description}</p>
        <DocBody source={page.body} />
        {page.path === "help/security-policy" ? (
          <Callout kind="note">
            <p>
              <strong>{tChrome("securityContactLabel")}:</strong>{" "}
              {securityContact ? (
                <a href={securityContact.href}>{securityContact.display}</a>
              ) : (
                tChrome("securityContactUnset")
              )}
            </p>
          </Callout>
        ) : null}
      </article>
      <DocsPager locale={locale} prev={prev} next={next} />
    </DocsShell>
  )
}
