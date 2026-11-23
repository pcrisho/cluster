"use client"

import { useCallback } from "react"

import { compressForKnow } from "@/lib/compress-image"
import { documentsApi, type DocumentOwner } from "@/lib/documents/api"
import { knowApi } from "@/lib/know-api"

/**
 * Upload handlers of a KNOW rich-text body (a page body or a space description): images are
 * compressed and stored in the owner's image folder, other files become documents of the owner
 * and are inserted as file cards.
 */
export function useKnowUploads(owner: DocumentOwner) {
  const { kind, id } = owner

  const onImageUpload = useCallback(
    async (file: File) => {
      const image = await compressForKnow(file)
      const res =
        kind === "page"
          ? await knowApi.uploadPageImage(id, image)
          : await knowApi.uploadSpaceImage(id, image)
      return res.data.key
    },
    [kind, id]
  )

  const onFileUpload = useCallback(
    async (file: File) => {
      const doc = await documentsApi.create({ kind, id }, file)
      return {
        documentId: doc.id,
        versionId: doc.currentVersion.id,
        name: doc.name,
        mimetype: doc.currentVersion.mimetype,
        size: doc.currentVersion.size,
        versionNumber: doc.currentVersion.version,
      }
    },
    [kind, id]
  )

  return { onImageUpload, onFileUpload }
}
