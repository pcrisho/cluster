"use client"

import { useState } from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { documentsApi } from "@/lib/documents/api"
import { canPreview, fileTypeLabel } from "@/lib/documents/file-types"
import { DocumentIcon, formatFileSize } from "@/lib/documents/utils"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface FilePreviewDialogProps {
  documentId: string
  versionId: string
  name: string
  mimetype: string
  size: number
  onClose: () => void
}

type View = "image" | "pdf" | "download"

function viewFor(mimetype: string): View {
  if (!canPreview(mimetype)) return "download"
  return mimetype === "application/pdf" ? "pdf" : "image"
}

/**
 * The in-app viewer for an attached file, opened from a file card in a body or from "Attached
 * files". PDF and raster images are shown (the API serves them `inline`); every other type,
 * HEIC and SVG included, offers the download.
 */
export function FilePreviewDialog({
  documentId,
  versionId,
  name,
  mimetype,
  size,
  onClose,
}: FilePreviewDialogProps) {
  const t = useTranslations("editor")
  const [failed, setFailed] = useState(false)
  const view = failed ? "download" : viewFor(mimetype)
  const downloadUrl = documentsApi.downloadUrl(documentId, versionId)
  const previewUrl = documentsApi.previewUrl(documentId, versionId)
  const title = name || t("untitledFile")
  const meta = [fileTypeLabel(mimetype), formatFileSize(size)]
    .filter(Boolean)
    .join(" · ")

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden",
          view === "download" ? "sm:max-w-md" : "sm:max-w-5xl"
        )}
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="truncate">{title}</DialogTitle>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogDescription>{meta}</DialogDescription>
            {view !== "download" ? (
              <Button asChild size="sm" variant="outline">
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  <Download />
                  {t("download")}
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {view === "pdf" ? (
          <iframe
            src={previewUrl}
            title={title}
            className="min-h-0 w-full shrink grow basis-[70dvh] rounded-lg border bg-muted"
          />
        ) : view === "image" ? (
          <div className="flex min-h-0 shrink grow basis-[70dvh] items-center justify-center overflow-auto rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the file cookie */}
            <img
              src={previewUrl}
              alt={title}
              className="max-w-full object-contain"
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          <Empty className="border p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DocumentIcon mimetype={mimetype} />
              </EmptyMedia>
              <EmptyTitle>
                {failed ? t("previewUnavailable") : t("noPreview")}
              </EmptyTitle>
              <EmptyDescription>{t("downloadHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild size="sm" variant="outline">
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  <Download />
                  {t("download")}
                </a>
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </DialogContent>
    </Dialog>
  )
}
