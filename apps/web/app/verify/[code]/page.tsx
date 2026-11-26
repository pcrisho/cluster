"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { BadgeCheckIcon, CircleHelpIcon, SearchXIcon } from "lucide-react"

import { verifyCertificate, type VerifiedCertificate } from "@/lib/grow-api"
import { ClusterWordmark } from "@/components/shared/cluster-wordmark"
import { Skeleton } from "@/components/ui/skeleton"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

type State =
  | { kind: "loading" }
  | { kind: "valid"; cert: VerifiedCertificate }
  | { kind: "invalid" }
  | { kind: "error" }

/** Public: anyone with a code sees who earned which course, from whom and when. No sign-in. */
export default function VerifyPage() {
  const t = useTranslations("verify")
  const dates = useDates()
  const { code } = useParams<{ code: string }>()
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    verifyCertificate(code)
      .then((cert) =>
        setState(cert ? { kind: "valid", cert } : { kind: "invalid" })
      )
      .catch(() => setState({ kind: "error" }))
  }, [code])

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="p-6 print:hidden">
        <ClusterWordmark label={t("logo")} className="h-8 w-auto text-foreground" />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <section
          aria-live="polite"
          className="w-full max-w-md rounded-xl border bg-card p-8 text-center"
        >
          {state.kind === "loading" ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="mx-auto size-10 rounded-full" />
              <Skeleton className="mx-auto h-6 w-48" />
              <Skeleton className="mx-auto h-4 w-64" />
              <Skeleton className="mx-auto h-4 w-56" />
            </div>
          ) : state.kind === "valid" ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2">
                <BadgeCheckIcon className="size-10 text-success" aria-hidden />
                <h1 className="text-xl font-semibold">{t("valid")}</h1>
              </div>
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("awardedTo")}</dt>
                  <dd className="text-lg font-medium">
                    {state.cert.recipientName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("forCompleting")}
                  </dt>
                  <dd className="font-medium">{state.cert.courseTitle}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("issued")}</dt>
                  <dd className="font-medium">
                    {dates.calendar(state.cert.issuedOn, "dateLong")}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                {t.rich("issuedBy", {
                  organization: state.cert.organizationName,
                  code: state.cert.code,
                  mono: (chunks) => (
                    <span className="font-mono text-foreground">{chunks}</span>
                  ),
                })}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {state.kind === "error" ? (
                <CircleHelpIcon
                  className="size-10 text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <SearchXIcon className="size-10 text-danger" aria-hidden />
              )}
              <h1 className="text-xl font-semibold">
                {state.kind === "error" ? t("checkFailed") : t("notFound")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {state.kind === "error"
                  ? t("checkFailedBody")
                  : t.rich("notFoundBody", {
                      code,
                      mono: (chunks) => (
                        <span className="font-mono whitespace-nowrap text-foreground">
                          {chunks}
                        </span>
                      ),
                    })}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
