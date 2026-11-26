"use client"

import { useCallback, useEffect, useState } from "react"
import { AwardIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { growApi, type Certificate } from "@/lib/grow-api"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CertificateActions } from "@/components/grow/learn/certificate-actions"
import { useDates } from "@/lib/i18n/use-dates"

/** Every certificate the person earned, newest first. */
export function MyCertificates() {
  const t = useTranslations("grow.myCertificates")
  const dates = useDates()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [certs, setCerts] = useState<Certificate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumb([{ label: "GROW", href: "/grow" }, { label: t("title") }])
  }, [setBreadcrumb, t])

  const load = useCallback(async () => {
    try {
      setCerts(await growApi.listCertificates())
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  if (error)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t("loadErrorTitle")}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => void load()}>
            {t("tryAgain")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  if (!certs)
    return (
      <ul className="divide-y rounded-lg border" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-40" />
          </li>
        ))}
      </ul>
    )
  if (certs.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AwardIcon />
          </EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <ul className="divide-y rounded-lg border">
      {certs.map((c) => (
        <li
          key={c.id}
          className="flex flex-col gap-3 p-4 md:flex-row md:items-center"
        >
          <AwardIcon
            className="hidden size-5 shrink-0 text-muted-foreground md:block"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-medium">{c.courseTitle}</p>
            <p className="text-xs text-muted-foreground">
              {t("issuedOn", { date: dates.calendar(c.issuedOn) })} ·{" "}
              <span className="font-mono">{c.code}</span>
            </p>
          </div>
          <CertificateActions certificate={c} withCopy />
        </li>
      ))}
    </ul>
  )
}
