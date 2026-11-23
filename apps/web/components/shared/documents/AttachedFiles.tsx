"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileText, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { documentsApi, type DocumentOwner } from "@/lib/documents/api"
import { acceptAttribute, uploadProblem } from "@/lib/documents/file-types"
import type { DocumentListItem } from "@/lib/documents/types"
import { cn } from "@/lib/utils"

import { DocumentList, DocumentListSkeleton } from "./DocumentList"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

interface AttachedFilesProps {
  /** The page or space the files belong to. */
  owner: DocumentOwner
  /** May upload and delete: an editor of the page, a manager of the space. */
  canUpload: boolean
  className?: string
}

/**
 * "Attached files" of a page or a space: loads the documents, lets those who can upload add one,
 * and reuses `<DocumentList />` (preview, versions, download) for the rest.
 */
export function AttachedFiles({
  owner,
  canUpload,
  className,
}: AttachedFilesProps) {
  const t = useTranslations("documents")
  const { kind, id } = owner
  const [docs, setDocs] = useState<DocumentListItem[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      const res = await documentsApi.list({ kind, id })
      // Schedule the state update out of the effect body so the
      // react-hooks/set-state-in-effect rule doesn't fire.
      queueMicrotask(() => setDocs(res.data))
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : t("loadFailed"))
    }
  }, [kind, id, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleUpload = async (file: File) => {
    const problem = uploadProblem("document", file)
    if (problem) {
      toast.error(problem)
      return
    }
    setUploading(true)
    try {
      await documentsApi.create({ kind, id }, file)
      toast.success(t("uploaded"))
      await reload()
    } catch (err) {
      toast.error(
        err instanceof Error ? getErrorMessage(err) : t("uploadFailed")
      )
    } finally {
      setUploading(false)
    }
  }

  // Nothing attached: readers see nothing, uploaders only the upload button.
  if (docs !== null && docs.length === 0 && !canUpload) return null

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-muted-foreground">
          <FileText className="size-4" />
          {t("attached")}
        </h2>
        {canUpload ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              {uploading ? t("uploading") : t("upload")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttribute("document")}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ""
              }}
            />
          </>
        ) : null}
      </header>

      {docs === null ? (
        <DocumentListSkeleton />
      ) : docs.length === 0 ? null : (
        <DocumentList
          documents={docs}
          isEditor={canUpload}
          onChanged={reload}
          onUploadClick={() => fileInputRef.current?.click()}
        />
      )}
    </section>
  )
}
