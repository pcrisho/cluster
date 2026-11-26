"use client"

import { useState } from "react"
import { Download, FileText, MoreVertical, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { FilePreviewDialog } from "@/components/shared/rich-text-editor/FilePreviewDialog"
import { documentsApi } from "@/lib/documents/api"
import type { DocumentListItem } from "@/lib/documents/types"
import { DocumentIcon, formatFileSize } from "@/lib/documents/utils"

import { DocumentVersionTimeline } from "./DocumentVersionTimeline"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

interface DocumentListProps {
  documents: DocumentListItem[]
  isEditor: boolean
  onChanged: () => void
  onUploadClick: () => void
}

/**
 * The "Attached files" list: one row per document. The name opens the
 * in-app viewer; editors also delete.
 */
export function DocumentList({
  documents,
  isEditor,
  onChanged,
  onUploadClick,
}: DocumentListProps) {
  const tc = useTranslations("common")
  const t = useTranslations("documents")
  const [openVersions, setOpenVersions] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<DocumentListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("none")}</p>
        {isEditor ? (
          <Button size="sm" variant="outline" onClick={onUploadClick}>
            {t("uploadFirst")}
          </Button>
        ) : null}
      </div>
    )
  }

  const handleDelete = async (doc: DocumentListItem) => {
    if (!window.confirm(t("deleteConfirm", { name: doc.name }))) return
    setBusyId(doc.id)
    try {
      await documentsApi.remove(doc.id)
      toast.success(t("deleted"))
      onChanged()
    } catch (err) {
      toast.error(
        err instanceof Error ? getErrorMessage(err) : t("deleteFailed")
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => {
          return (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-md border bg-card p-3"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <DocumentIcon
                  mimetype={doc.currentVersion.mimetype}
                  className="h-5 w-5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setPreviewing(doc)}
                  className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {doc.name}
                </button>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(doc.currentVersion.size)} ·{" "}
                  {tc("version", { version: doc.currentVersion.version })}
                  {doc.versionsCount > 1
                    ? ` · ${t("versionsCount", { count: doc.versionsCount })}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpenVersions(doc.id)}
              >
                {t("viewVersions")}
              </Button>
              <Button asChild size="icon-xs" variant="ghost">
                <a
                  href={documentsApi.downloadUrl(doc.id, doc.currentVersion.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("download", { name: doc.name })}
                >
                  <Download />
                </a>
              </Button>
              {isEditor ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={busyId === doc.id}
                      aria-label={t("moreActions")}
                    >
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => handleDelete(doc)}
                    >
                      <Trash2 />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          )
        })}
      </ul>
      {previewing ? (
        <FilePreviewDialog
          documentId={previewing.id}
          versionId={previewing.currentVersion.id}
          name={previewing.name}
          mimetype={previewing.currentVersion.mimetype}
          size={previewing.currentVersion.size}
          onClose={() => setPreviewing(null)}
        />
      ) : null}
      {openVersions ? (
        <DocumentVersionTimeline
          documentId={openVersions}
          isEditor={isEditor}
          onClose={() => setOpenVersions(null)}
          onRestored={onChanged}
        />
      ) : null}
    </>
  )
}

export function DocumentListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-md border bg-card p-3"
        >
          <Skeleton className="size-10" />
          <div className="flex-1">
            <Skeleton className="mb-1 h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}
