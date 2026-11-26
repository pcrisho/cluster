"use client"

import { useRef, useState } from "react"
import { FileSpreadsheetIcon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { acceptAttribute } from "@/lib/documents/file-types"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export interface DropzoneError {
  message: string
  /** Extra lines, e.g. the columns a header check found wrong. */
  details?: string[]
}

/** Picks or receives one .xlsx; the page checks and previews it. */
export function ImportDropzone({
  file,
  busy,
  error,
  onFile,
}: {
  file: File | null
  busy: boolean
  error: DropzoneError | null
  onFile: (file: File) => void
}) {
  const t = useTranslations("settings.import.drop")
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const dropped = e.dataTransfer.files[0]
          if (dropped && !busy) onFile(dropped)
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors",
          over ? "border-primary bg-muted" : "border-border",
          error && "border-danger-border"
        )}
      >
        {busy ? (
          <Spinner className="size-6 text-muted-foreground" />
        ) : file ? (
          <FileSpreadsheetIcon
            className="size-6 text-muted-foreground"
            aria-hidden
          />
        ) : (
          <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
        )}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            {busy
              ? t("checking", { name: file?.name ?? "" })
              : (file?.name ?? t("title"))}
          </p>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {file ? t("replace") : t("choose")}
        </Button>
        <input
          ref={input}
          type="file"
          hidden
          accept={acceptAttribute("spreadsheet")}
          onChange={(e) => {
            const chosen = e.target.files?.[0]
            // Cleared so choosing the same corrected file again still fires.
            e.target.value = ""
            if (chosen) onFile(chosen)
          }}
        />
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-1 text-sm text-danger-text"
        >
          <p>{error.message}</p>
          {error.details?.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
