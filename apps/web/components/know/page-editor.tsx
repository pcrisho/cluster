"use client"

import { memo, useCallback } from "react"
import { useRouter } from "next/navigation"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

import { CollaborativeEditor } from "@/components/shared/rich-text-editor/CollaborativeEditor"
import { useKnowUploads } from "@/components/know/use-know-uploads"
import { knowApi } from "@/lib/know-api"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export interface PageEditorProps {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  editable: boolean
  /**
   * The editor routes:
   *   - paste / drop images  → compressed, then `POST /pages/:id/images`
   *   - paste / drop files   → `POST /pages/:id/documents`
   *   - in-body page creation → `POST /spaces/:spaceId/pages`
   *   - mentions (read-only)  → `GET /pages/search`
   */
  pageId: string
  /** Space context for in-body page creation via `[[Title]]`. */
  spaceId: string
  spaceName?: string
  /** Called after a page is created inline via `[[Title]]`. */
  onPageCreated?: () => void
}

/**
 * KNOW page-body editor: the live document (Yjs, via the collab service) plus the page's upload
 * and page-creation hooks. Images go through `POST /pages/:id/images`, document attachments
 * through the transversal `documents` module.
 */
export const PageEditor = memo(function PageEditor({
  ydoc,
  provider,
  editable,
  pageId,
  spaceId,
  spaceName,
  onPageCreated,
}: PageEditorProps) {
  const t = useTranslations("know.editor")
  const router = useRouter()

  const { onImageUpload, onFileUpload } = useKnowUploads({
    kind: "page",
    id: pageId,
  })

  const handleCreatePage = useCallback(
    async (title: string) => {
      try {
        const created = await knowApi.createPage(spaceId, {
          title,
          status: "DRAFT",
        })
        const page = created.data
        toast(t("pageCreated"), {
          description: page.title,
          action: {
            label: t("open"),
            onClick: () => router.push(`/know/spaces/${spaceId}/${page.id}`),
          },
        })
        onPageCreated?.()
        return {
          id: page.id,
          title: page.title,
          spaceId,
          spaceName: spaceName ?? "",
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? getErrorMessage(err) : t("createFailed")
        )
        return null
      }
    },
    [router, spaceId, spaceName, onPageCreated, t]
  )

  return (
    <CollaborativeEditor
      ydoc={ydoc}
      provider={provider}
      editable={editable}
      onImageUpload={onImageUpload}
      onFileUpload={onFileUpload}
      onCreatePage={handleCreatePage}
    />
  )
})
