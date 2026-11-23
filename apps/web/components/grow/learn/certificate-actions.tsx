"use client"

import { CopyIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { certificatePdfUrl, type Certificate } from "@/lib/grow-api"
import { Button } from "@/components/ui/button"

/** Download the PDF, open the public verification page, copy the code. */
export function CertificateActions({
  certificate,
  withCopy,
}: {
  certificate: Pick<Certificate, "id" | "code">
  withCopy?: boolean
}) {
  const t = useTranslations("grow.certificateActions")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(certificate.code)
      toast.success(t("codeCopied"))
    } catch {
      toast.error(t("copyFailed"))
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm">
        <a href={certificatePdfUrl(certificate.id)} download>
          <DownloadIcon data-icon="inline-start" />
          {t("downloadPdf")}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a
          href={`/verify/${certificate.code}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon data-icon="inline-start" />
          {t("verificationPage")}
        </a>
      </Button>
      {withCopy && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copy()}
          aria-label={t("copyCodeLabel", { code: certificate.code })}
        >
          <CopyIcon data-icon="inline-start" />
          {t("copyCode")}
        </Button>
      )}
    </div>
  )
}
