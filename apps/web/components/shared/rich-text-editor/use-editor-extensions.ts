import { useInsertionEffect, useMemo, useRef, useState } from "react"
import type { Extensions as TiptapExtensions } from "@tiptap/core"

import { getClientEditorExtensions } from "@/lib/rich-text/extensions-client"

export interface EditorCallbacks {
  /**
   * Image upload (paste / drop). The callback returns the storage key of the
   * uploaded image. When omitted, the editor still allows drag/drop of images
   * but the upload will fail gracefully.
   */
  onImageUpload?: (file: File) => Promise<string>
  /**
   * Document upload. The callback returns the data needed to
   * insert a `fileCard` node. When omitted, `/file` slash
   * commands and file paste are disabled.
   */
  onFileUpload?: (file: File) => Promise<{
    documentId: string
    versionId: string
    name: string
    mimetype: string
    size: number
    versionNumber: number
  }>
  /**
   * In-body page creation. Called when the user types `/page`
   * or `[[Title]]`. The host component is expected to open a
   * dialog and create the page, then return the created
   * page's data so the editor can insert a `pageMention` to it.
   */
  onCreatePage?: (proposedTitle: string) => Promise<{
    id: string
    title: string
    spaceId: string
    spaceName: string
  } | null>
}

interface UseEditorExtensionsOptions extends EditorCallbacks {
  placeholder?: string
  /** Appended to the default set. */
  extra?: TiptapExtensions
  collaborative?: boolean
  /** The `@` popup that links KNOW pages; default on. */
  pageMentions?: boolean
}

/**
 * The client extension list, built once per `placeholder`/`extra`/`collaborative`. Which callbacks
 * exist is fixed at mount (it decides which plugins are installed); their latest version is read
 * through refs so a parent re-render never rebuilds the editor.
 */
export function useEditorExtensions({
  placeholder,
  extra,
  collaborative,
  pageMentions,
  onImageUpload,
  onFileUpload,
  onCreatePage,
}: UseEditorExtensionsOptions): TiptapExtensions {
  const [has] = useState({
    image: !!onImageUpload,
    file: !!onFileUpload,
    page: !!onCreatePage,
  })
  const imageRef = useRef(onImageUpload)
  const fileRef = useRef(onFileUpload)
  const pageRef = useRef(onCreatePage)
  useInsertionEffect(() => {
    imageRef.current = onImageUpload
    fileRef.current = onFileUpload
    pageRef.current = onCreatePage
  }, [onImageUpload, onFileUpload, onCreatePage])

  return useMemo(
    () =>
      // The refs are read only when the editor calls the callbacks (events), never during render.
      // eslint-disable-next-line react-hooks/refs
      getClientEditorExtensions({
        onImageUpload: has.image
          ? (file) => imageRef.current!(file)
          : undefined,
        onFileUpload: has.file ? (file) => fileRef.current!(file) : undefined,
        onCreatePage: has.page ? (title) => pageRef.current!(title) : undefined,
        placeholder,
        extra,
        collaborative,
        pageMentions,
      }),
    [placeholder, extra, collaborative, pageMentions, has]
  )
}
