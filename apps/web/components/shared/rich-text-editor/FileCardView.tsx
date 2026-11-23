"use client"

import { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Download, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { documentsApi } from "@/lib/documents/api"
import { DocumentIcon, formatFileSize } from "@/lib/documents/utils"

import { FilePreviewDialog } from "./FilePreviewDialog"
import { tPlain } from "@/lib/i18n/plain"

/**
 * React NodeView for the `fileCard` node: the card opens the in-app viewer,
 * the icon button downloads.
 */
export function FileCardView(props: NodeViewProps) {
  const attrs = (props.node.attrs ?? {}) as {
    documentId: string
    versionId: string
    name: string
    mimetype: string
    size: number
    versionNumber: number
  }
  const { name, mimetype, size, documentId, versionId, versionNumber } = attrs
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!documentId || !versionId) {
    return (
      <NodeViewWrapper
        data-type="file-card"
        className="my-3 flex items-center gap-3 rounded-md border border-dashed bg-muted/30 p-3"
      >
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">
            {tPlain("editor.fileUnavailable")}
          </p>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      data-type="file-card"
      className="my-3 flex items-center gap-3 rounded-md border bg-card p-3"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <DocumentIcon mimetype={mimetype} className="h-5 w-5" />
      </div>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate font-medium">
          {name || tPlain("editor.untitledFile")}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(size)} ·{" "}
          {tPlain("common.version", { version: versionNumber })}
        </p>
      </button>
      <Button
        asChild
        size="icon-xs"
        variant="ghost"
        aria-label={tPlain("editor.downloadNamed", {
          name: name || tPlain("editor.untitledFile"),
        })}
      >
        <a
          href={documentsApi.downloadUrl(documentId, versionId)}
          target="_blank"
          rel="noreferrer"
        >
          <Download />
        </a>
      </Button>
      {previewOpen ? (
        <FilePreviewDialog
          documentId={documentId}
          versionId={versionId}
          name={name}
          mimetype={mimetype}
          size={size}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
