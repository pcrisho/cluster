"use client"

import { CopyIcon, DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Recovery codes shown once, right after they are made: copy them or download them as a text file. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("auth.mfa")
  const text = `${t("codesFile")}\n\n${codes.join("\n")}\n`

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "cluster-recovery-codes.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success(t("copied")))
          }
        >
          <CopyIcon data-icon="inline-start" />
          {t("copy")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon data-icon="inline-start" />
          {t("download")}
        </Button>
      </div>
    </div>
  )
}
