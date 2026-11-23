"use client"

import { ReactNodeViewRenderer } from "@tiptap/react"
import { FileCardNode } from "@cluster/editor-schema"

import { FileCardView } from "@/components/shared/rich-text-editor/FileCardView"

export interface FileCardAttrs {
  documentId: string
  versionId: string
  name: string
  mimetype: string
  size: number
  versionNumber: number
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileCard: {
      insertFileCard: (attrs: FileCardAttrs) => ReturnType
    }
  }
}

/**
 * View layer of the shared `fileCard` node: renders the card with
 * `FileCardView`. The schema (attributes, parse and render rules)
 * lives in `@cluster/editor-schema`.
 *
 * The actual upload is owned by the consumer (the parent
 * `RichTextEditor` wires `onFileUpload`); the node is inserted after
 * a successful upload, so the card renders without a follow-up call.
 */
export const FileCard = FileCardNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FileCardView)
  },

  addCommands() {
    return {
      insertFileCard:
        (attrs: FileCardAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "fileCard",
            attrs,
          })
        },
    }
  },
})
