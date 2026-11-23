import { ArrowRight, Cloud, Handshake, Server } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { getDocsUrl } from "@/lib/site-links"

import { accent } from "./accent"
import { GrowPlayerMock } from "./mocks/grow-player"
import { Aurora } from "./aurora"
import { BentoCell } from "./bento-cell"
import { BrandPicker } from "./brand-picker"
import { SectionHeader } from "./section-header"
import { SpotlightGrid } from "./spotlight-grid"

export function PlatformSection() {
  const t = useTranslations("platform")
  const locale = useLocale()
  const docsUrl = getDocsUrl()
  const installGuide = docsUrl
    ? new URL(`${locale}/self-host/requirements/`, docsUrl).toString()
    : null

  return (
    <section
      id="platform"
      className="relative isolate scroll-mt-20 py-20 sm:py-28"
    >
      <Aurora />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeader
          title={t.rich("title", { accent })}
          subtitle={t("subtitle")}
        />

        <SpotlightGrid className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          {/* Your brand: the one point the page can prove on itself (it re-tints Silk too). */}
          <BentoCell
            className="lg:col-span-4 lg:row-span-2"
            title={t("yourBrand")}
            description={t("yourBrandDesc")}
          >
            <div className="flex h-full flex-col justify-between gap-8">
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium text-foreground">
                  {t("brandHint")}
                </p>
                <BrandPicker label={t("brandColours")} />
              </div>
              {/* The same screen as the hero, re-tinted live by the picker. */}
              <div className="-mr-6 -mb-6 h-72 overflow-hidden rounded-tl-xl">
                <GrowPlayerMock focus="left" width={1280} />
              </div>
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            title={t("selfHosted")}
            description={t("selfHostedDesc")}
          >
            {/* Where it runs, not how to install it: that is in the docs (D10). */}
            <div className="flex flex-col gap-2" aria-hidden>
              {(
                [
                  ["servers", Server],
                  ["cloud", Cloud],
                  ["managed", Handshake],
                ] as const
              ).map(([key, Icon]) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  key={key}
                >
                  <Icon className="size-4 text-primary" />
                  {t(`hosting.${key}`)}
                </div>
              ))}
            </div>
            {installGuide && (
              <a
                href={installGuide}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {t("installGuide")}
                <ArrowRight className="size-3.5" aria-hidden />
              </a>
            )}
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            title={t("isolatedData")}
            description={t("isolatedDataDesc")}
          >
            <FactList facts={[t("privacy.files"), t("privacy.access")]} />
          </BentoCell>

          <BentoCell
            className="lg:col-span-3"
            title={t("bilingual")}
            description={t("bilingualDesc")}
          >
            <div className="flex flex-col gap-2" aria-hidden>
              {(["En", "Es"] as const).map((code) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  key={code}
                >
                  <span className="w-6 text-xs font-semibold text-muted-foreground uppercase">
                    {code}
                  </span>
                  {t(`sample${code}`)}
                </div>
              ))}
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-3"
            title={t("security")}
            description={t("securityDesc")}
          >
            <FactList
              facts={(["mfa", "audit", "certificates"] as const).map((fact) =>
                t(`facts.${fact}`)
              )}
            />
          </BentoCell>
        </SpotlightGrid>
      </div>
    </section>
  )
}

function FactList({ facts }: { facts: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm text-foreground">
      {facts.map((fact) => (
        <li className="flex items-start gap-2.5" key={fact}>
          <span
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          {fact}
        </li>
      ))}
    </ul>
  )
}
