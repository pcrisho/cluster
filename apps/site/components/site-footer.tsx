import Image from "next/image"
import { useTranslations } from "next-intl"

import { getDocsUrl, getGithubUrl } from "@/lib/site-links"

export function SiteFooter() {
  const t = useTranslations("footer")
  const githubUrl = getGithubUrl()
  const docsUrl = getDocsUrl()
  const currentYear = new Date().getFullYear().toString()

  return (
    <footer className="w-full border-t border-border bg-card/40 py-12 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div className="flex items-center gap-2">
            <Image
              src="/Imagotipo.svg"
              alt="Cluster"
              width={24}
              height={24}
              className="size-6"
            />
            <span className="font-semibold text-foreground">Cluster</span>
          </div>
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            {t("tagline")}
          </p>
        </div>

        <nav
          aria-label="Footer Navigation"
          className="flex flex-wrap items-center justify-center gap-6 text-sm"
        >
          <a href="#know" className="transition-colors hover:text-foreground">
            {t("modules")}
          </a>
          <a
            href="#platform"
            className="transition-colors hover:text-foreground"
          >
            {t("platform")}
          </a>
          <a
            href="#open-core"
            className="transition-colors hover:text-foreground"
          >
            {t("openSource")}
          </a>
          <a href="#faq" className="transition-colors hover:text-foreground">
            {t("faq")}
          </a>
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t("docs")}
            </a>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t("github")}
            </a>
          )}
          <a
            href="#contact"
            className="transition-colors hover:text-foreground"
          >
            {t("contact")}
          </a>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-7xl border-t border-border/60 px-4 pt-6 text-center text-xs text-muted-foreground sm:px-6">
        <p>
          {t("copyright", { year: currentYear })} · {t("license")}
        </p>
      </div>
    </footer>
  )
}
