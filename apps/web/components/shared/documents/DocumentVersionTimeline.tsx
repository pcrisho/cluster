"use client"

import { useEffect, useRef, useState } from "react"
import { Download, History, RotateCcw, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { documentsApi } from "@/lib/documents/api"
import { acceptAttribute, uploadProblem } from "@/lib/documents/file-types"
import type { DocumentVersion } from "@/lib/documents/types"
import {
  DocumentIcon,
  formatFileSize,
  getMimeLabel,
} from "@/lib/documents/utils"
import { useDates } from "@/lib/i18n/use-dates"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

interface DocumentVersionTimelineProps {
  documentId: string
  isEditor: boolean
  onClose: () => void
  onRestored: () => void
}

/**
 * Modal that shows the full version history of a document.
 * Editors can upload a new version (must match the existing
 * mimetype) and restore an old version as the current one.
 * Viewers see the same timeline in read-only.
 */
export function DocumentVersionTimeline({
  documentId,
  isEditor,
  onClose,
  onRestored,
}: DocumentVersionTimelineProps) {
  const tc = useTranslations("common")
  const t = useTranslations("documents")
  const dates = useDates()
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null)
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await documentsApi.listVersions(documentId)
        if (!cancelled) setVersions(res.data)
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? getErrorMessage(err) : t("historyFailed")
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId, t])

  const handleRestore = async (version: DocumentVersion) => {
    if (!window.confirm(t("restoreConfirm", { version: version.version })))
      return
    setBusyVersionId(version.id)
    try {
      await documentsApi.restoreVersion(documentId, version.id)
      toast.success(t("restored", { version: version.version }))
      onRestored()
      onClose()
    } catch (err) {
      toast.error(
        err instanceof Error ? getErrorMessage(err) : t("restoreFailed")
      )
    } finally {
      setBusyVersionId(null)
    }
  }

  const handleUploadVersion = async (file: File) => {
    const problem = uploadProblem("document", file)
    if (problem) {
      toast.error(problem)
      return
    }
    setUploading(true)
    try {
      await documentsApi.newVersion(documentId, file)
      toast.success(t("versionUploaded"))
      onRestored()
      onClose()
    } catch (err) {
      toast.error(
        err instanceof Error ? getErrorMessage(err) : t("versionUploadFailed")
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t("history")}
          </DialogTitle>
          <DialogDescription>{t("historyHint")}</DialogDescription>
        </DialogHeader>

        {versions === null ? (
          <ul className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Skeleton className="size-10" />
                <div className="flex-1">
                  <Skeleton className="mb-1 h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("noVersions")}
          </p>
        ) : (
          <ul className="flex max-h-96 min-h-0 flex-col gap-2 overflow-y-auto">
            {versions.map((v, idx) => {
              const isCurrent = idx === 0
              return (
                <li
                  key={v.id}
                  className="flex items-center gap-3 rounded-md border bg-card p-3"
                >
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <DocumentIcon mimetype={v.mimetype} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {tc("version", { version: v.version })}
                      {isCurrent ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {t("current")}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(v.size)} · {getMimeLabel(v.mimetype)} ·{" "}
                      {v.author
                        ? `${v.author.firstName} ${v.author.lastName}`
                        : "—"}
                      {" · "}
                      {dates.instant(v.createdAt, "dateTime")}
                    </p>
                    {v.note ? (
                      <p className="mt-1 text-xs text-muted-foreground italic">
                        &ldquo;{v.note}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  <Button asChild size="icon-xs" variant="ghost">
                    <a
                      href={documentsApi.downloadUrl(documentId, v.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("downloadVersion", { version: v.version })}
                    >
                      <Download />
                    </a>
                  </Button>
                  {isEditor && !isCurrent ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={busyVersionId === v.id}
                      onClick={() => handleRestore(v)}
                      aria-label={t("restoreVersion", { version: v.version })}
                    >
                      <RotateCcw />
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {isEditor ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={uploading || versions === null}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              {uploading ? t("uploading") : t("uploadVersion")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttribute("document")}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUploadVersion(file)
                e.target.value = ""
              }}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
