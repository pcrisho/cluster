import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { CtaSection } from "@/components/cta-section"
import { FaqSection } from "@/components/faq-section"
import { accent } from "@/components/accent"
import { BentoCell } from "@/components/bento-cell"
import { ConnectPeopleMock } from "@/components/mocks/connect-people"
import {
  AccessFragment,
  CertificateFragment,
  MarkdownFragment,
  ReportsFragment,
} from "@/components/mocks/fragments"
import { OpenCoreSection } from "@/components/open-core-section"
import { SpotlightGrid } from "@/components/spotlight-grid"
import { GrowDashboardMock } from "@/components/mocks/grow-dashboard"
import { KnowPageMock } from "@/components/mocks/know-page"
import { Hero } from "@/components/hero"
import { LandingSection } from "@/components/landing-section"
import { PlatformSection } from "@/components/platform-section"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { isSupportedLocale } from "@/lib/locale-pick"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isSupportedLocale(locale)) return {}

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003"
  const canonicalUrl = `${siteUrl}/${locale}/`
  const t = await getTranslations({ locale, namespace: "meta" })
  const title = t("title")
  const description = t("description")

  return {
    title,
    description,
    icons: { icon: "/favicon.svg" },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${siteUrl}/en/`,
        es: `${siteUrl}/es/`,
        "x-default": `${siteUrl}/en/`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Cluster",
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
  }
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isSupportedLocale(locale)) notFound()

  setRequestLocale(locale)
  const tModules = await getTranslations({ locale, namespace: "modules" })
  const big = "h-[26rem] lg:col-span-4 lg:row-span-2 lg:h-[40rem]"
  const small = "h-80 lg:col-span-2 lg:h-[19.5rem]"
  const grid = "grid grid-cols-1 gap-4 lg:grid-cols-6"

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="-mt-16 flex-1 overflow-hidden">
        <Hero locale={locale} />

        <LandingSection
          id="know"
          name={tModules("know.name")}
          role={tModules("know.role")}
          title={tModules.rich("know.tagline", { accent })}
          description={tModules("know.description")}
          bullets={[
            tModules("know.point1"),
            tModules("know.point2"),
            tModules("know.point3"),
          ]}
        >
          <SpotlightGrid className={grid}>
            <BentoCell
              className={big}
              flush
              title={tModules("know.cellPage")}
              description={tModules("know.cellPageDesc")}
            >
              <KnowPageMock focus="left" width={1120} />
            </BentoCell>
            <BentoCell
              className={small}
              fade
              title={tModules("know.cellAccess")}
              description={tModules("know.cellAccessDesc")}
            >
              <AccessFragment focus="left" />
            </BentoCell>
            <BentoCell
              className={small}
              fade
              title={tModules("know.cellMarkdown")}
              description={tModules("know.cellMarkdownDesc")}
            >
              <MarkdownFragment focus="left" />
            </BentoCell>
          </SpotlightGrid>
        </LandingSection>

        <LandingSection
          id="grow"
          name={tModules("grow.name")}
          role={tModules("grow.role")}
          title={tModules.rich("grow.tagline", { accent })}
          description={tModules("grow.description")}
          bullets={[
            tModules("grow.point1"),
            tModules("grow.point2"),
            tModules("grow.point3"),
            tModules("grow.point4"),
          ]}
        >
          <SpotlightGrid className={grid}>
            <BentoCell
              className={big}
              flush
              title={tModules("grow.cellDashboard")}
              description={tModules("grow.cellDashboardDesc")}
            >
              <GrowDashboardMock focus="left" width={1120} />
            </BentoCell>
            <BentoCell
              className={small}
              fade
              title={tModules("grow.cellCertificate")}
              description={tModules("grow.cellCertificateDesc")}
            >
              <CertificateFragment focus="center" />
            </BentoCell>
            <BentoCell
              className={small}
              fade
              title={tModules("grow.cellReports")}
              description={tModules("grow.cellReportsDesc")}
            >
              <ReportsFragment focus="left" />
            </BentoCell>
          </SpotlightGrid>
        </LandingSection>

        <LandingSection
          id="connect"
          name={tModules("connect.name")}
          role={tModules("connect.role")}
          title={tModules.rich("connect.tagline", { accent })}
          description={tModules("connect.description")}
          bullets={[
            tModules("connect.point1"),
            tModules("connect.point2"),
            tModules("connect.point3"),
          ]}
        >
          <SpotlightGrid className={grid}>
            <BentoCell
              className="h-[26rem] lg:col-span-6 lg:h-[36rem]"
              flush
              title={tModules("connect.point3")}
              description={tModules("connect.point1")}
            >
              <ConnectPeopleMock focus="center" width={1280} />
            </BentoCell>
          </SpotlightGrid>
          <p className="mt-10 text-sm text-foreground/75">
            <span className="font-semibold tracking-wide text-foreground">
              {tModules("life.name")}
            </span>{" "}
            <span className="font-accent text-base text-foreground">
              {tModules("life.role")}
            </span>
            {" — "}
            {tModules("life.description")}
          </p>
        </LandingSection>

        <PlatformSection />
        <OpenCoreSection />
        <FaqSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  )
}
