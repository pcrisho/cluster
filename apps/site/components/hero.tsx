import type { CSSProperties } from "react"
import { getTranslations } from "next-intl/server"
import { BlurText } from "@/components/blur-text"
import { GrowPlayerMock } from "@/components/mocks/grow-player"
import { Button } from "@/components/ui/button"
import { getDemoUrl } from "@/lib/demo-url"
import { getGithubUrl } from "@/lib/site-links"
import { CopyCommand } from "./copy-command"
import { HeroSilk } from "./hero-silk"

export interface HeroProps {
  locale: string
}

export async function Hero({ locale }: HeroProps) {
  const tHero = await getTranslations({ locale, namespace: "hero" })

  const demoUrl = getDemoUrl()
  const ctaHref = demoUrl ?? "#contact"
  const isExternal = Boolean(demoUrl && demoUrl.startsWith("https:"))
  const githubUrl = getGithubUrl()

  return (
    <section className="relative isolate overflow-hidden pt-28 pb-10 sm:pt-36 sm:pb-16">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <HeroSilk />
      </div>
      {/* Scrim only behind the text: Silk shows at the sides and through the glass window. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-radial-[ellipse_95%_50%_at_50%_32%] from-background via-background/90 to-transparent sm:bg-radial-[ellipse_55%_45%_at_50%_35%]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-t from-background to-transparent"
        aria-hidden
      />

      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 sm:px-6">
        <div className="flex max-w-5xl flex-col items-center text-center">
          <h1 className="text-display-1 text-display-tight font-semibold tracking-tight text-balance text-foreground">
            <BlurText text={tHero("titleLead")} accent={tHero("titleAccent")} />
          </h1>
          {/* Over Silk: darker than muted-foreground so it keeps 4.5:1 in light (evidence/contrast.md). */}
          <p
            className="enter mt-6 max-w-2xl text-lg text-pretty text-foreground/75"
            style={{ "--enter-delay": "280ms" } as CSSProperties}
          >
            {tHero("subtitle")}
          </p>
          {githubUrl ? (
            // Public repository: install first (owner's wireframe), the demo second.
            <div
              className="enter mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ "--enter-delay": "400ms" } as CSSProperties}
            >
              <CopyCommand command={`git clone ${githubUrl}`} />
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                  {tHero("github")}
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-11 glass-panel px-6 text-base"
              >
                <a
                  href={ctaHref}
                  {...(isExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {tHero("requestDemo")}
                </a>
              </Button>
            </div>
          ) : (
            <div
              className="enter mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ "--enter-delay": "400ms" } as CSSProperties}
            >
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <a
                  href={ctaHref}
                  {...(isExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {tHero("requestDemo")}
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-11 glass-panel px-6 text-base"
              >
                <a href="#know">{tHero("seeModules")}</a>
              </Button>
            </div>
          )}
        </div>

        {/* The window is glass over Silk; its own layer (Chromium drew opaque blocks over Silk while the H1 animated). */}
        <div
          className="enter mt-14 w-full max-w-6xl rounded-2xl glass-panel vignette-center p-2 will-change-transform sm:mt-16 sm:p-2.5"
          style={
            {
              "--enter-delay": "560ms",
              "--enter-duration": "1000ms",
              "--enter-shift": "2rem",
            } as CSSProperties
          }
        >
          <GrowPlayerMock width={1280} />
        </div>
      </div>
    </section>
  )
}
