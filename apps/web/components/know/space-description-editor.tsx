"use client"

import { memo } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

import { CollaborativeEditor } from "@/components/shared/rich-text-editor/CollaborativeEditor"
import { useKnowUploads } from "@/components/know/use-know-uploads"
import { useTranslations } from "next-intl"

interface SpaceDescriptionEditorProps {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  /** False for readers and while collab is unreachable. */
  editable: boolean
  spaceId: string
}

/**
 * The space description as a live document (`know.space`): managers write, readers follow.
 * Images and files go to the space (`/know/spaces/:id/images`, `/know/spaces/:id/documents`).
 */
export const SpaceDescriptionEditor = memo(function SpaceDescriptionEditor({
  ydoc,
  provider,
  editable,
  spaceId,
}: SpaceDescriptionEditorProps) {
  const t = useTranslations("know.space")
  const { onImageUpload, onFileUpload } = useKnowUploads({
    kind: "space",
    id: spaceId,
  })
  return (
    <CollaborativeEditor
      ydoc={ydoc}
      provider={provider}
      editable={editable}
      placeholder={t("descriptionPlaceholder")}
      onImageUpload={onImageUpload}
      onFileUpload={onFileUpload}
    />
  )
})
