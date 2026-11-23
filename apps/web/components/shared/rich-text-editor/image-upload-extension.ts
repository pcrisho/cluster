"use client"

import { toast } from "sonner"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import { bodyUploadKind, uploadProblem } from "@/lib/documents/file-types"
import { ImageWithUrl } from "@/lib/rich-text/image-view"
import { getErrorMessage } from "@/lib/api"
import { tPlain } from "@/lib/i18n/plain"

export interface FileUploadOptions {
  /**
   * Called when the user pastes / drops an image. Returns the
   * storage key to insert. Falsy callback disables image paste / drop.
   */
  onUpload?: (file: File) => Promise<string>
}

/**
 * View layer of the shared `image` node. Pasted / dropped images of an
 * inline type (`bodyUploadKind`; HEIC and SVG go to the file card instead)
 * are uploaded through the consumer's `onUpload` callback and
 * the returned storage key becomes the image's `src`. On failure the node is
 * NOT inserted and the editor state is left untouched. This module
 * lives under `components/shared/` because every editor reuses it.
 */
export const ImageUpload = ImageWithUrl.extend<FileUploadOptions>({
  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin({
        key: new PluginKey("image-upload"),
        props: {
          handlePaste(view, event) {
            const files = event.clipboardData?.files
            if (!files || files.length === 0) return false
            const image = Array.from(files).find(isInlineImage)
            if (!image) return false
            event.preventDefault()
            void uploadAndInsert(view, image, opts.onUpload)
            return true
          },
          handleDrop(view, event) {
            const files = event.dataTransfer?.files
            if (!files || files.length === 0) return false
            const image = Array.from(files).find(isInlineImage)
            if (!image) return false
            event.preventDefault()
            const coords = { left: event.clientX, top: event.clientY }
            void uploadAndInsert(view, image, opts.onUpload, coords)
            return true
          },
        },
      }),
    ]
  },
})

async function uploadAndInsert(
  view: EditorView,
  file: File,
  onUpload?: (file: File) => Promise<string>,
  pos?: { left: number; top: number }
) {
  if (!onUpload) return
  const problem = uploadProblem("image", file)
  if (problem) {
    toast.error(problem)
    return
  }
  try {
    const url = await onUpload(file)
    const insertAt = pos
      ? view.posAtCoords({ left: pos.left, top: pos.top })?.pos
      : view.state.selection.from
    if (insertAt == null) return
    const node = view.state.schema.nodes.image?.create({
      src: url,
      alt: file.name,
    })
    if (!node) return
    view.dispatch(view.state.tr.insert(insertAt, node))
  } catch (err) {
    // The editor state stays untouched; the user only sees the toast.
    toast.error(
      err instanceof Error
        ? getErrorMessage(err)
        : tPlain("editor.slash.uploadImageFailed")
    )
  }
}

function isInlineImage(file: File): boolean {
  return bodyUploadKind(file) === "image"
}
