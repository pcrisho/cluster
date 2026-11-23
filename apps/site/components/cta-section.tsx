import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { BlurText } from "@/components/blur-text"
import { CopyCommand } from "@/components/copy-command"
import { getDemoUrl } from "@/lib/demo-url"
import { getGithubUrl } from "@/lib/site-links"

export function CtaSection() {
  const t = useTranslations("cta")
  const demoUrl = getDemoUrl()
  const isExternal = Boolean(demoUrl && demoUrl.startsWith("https:"))
  const githubUrl = getGithubUrl()

  return (
    <section
      id="contact"
      className="relative isolate overflow-hidden bg-background bg-cta-dots py-24 sm:py-32"
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[24rem] -translate-x-1/2 -translate-y-1/2 animate-cta-glow rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-display-2 text-display-tight font-semibold tracking-tight text-balance text-foreground">
          <BlurText text={t("titleLead")} accent={t("titleAccent")} />
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty text-foreground/75 sm:text-lg">
          {t("subtitle")}
        </p>

        {/* Without a demo link there is nowhere to send people: no button that links to itself */}
        {githubUrl && (
          <div className="mt-8 flex justify-center">
            <CopyCommand command={`git clone ${githubUrl}`} />
          </div>
        )}
        {demoUrl && (
          <div className="mt-6 flex justify-center">
            <Button asChild size="lg" className="h-11 px-8 text-base">
              <a
                href={demoUrl}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {t("button")}
              </a>
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
