"use client"

import type { ComputePositionConfig } from "@floating-ui/dom"
import { DragHandle } from "@tiptap/extension-drag-handle-react"
import { useEditorState, type Editor } from "@tiptap/react"
import { useTranslations } from "next-intl"

// Module-level on purpose: DragHandle re-registers its plugin whenever this
// object changes identity, so an inline literal would rebuild it every render.
const POSITION: ComputePositionConfig = {
  placement: "left-start",
  strategy: "absolute",
}

export function EditorDragHandle({ editor }: { editor: Editor }) {
  const t = useTranslations("editor")
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable,
  })

  if (!editable) return null

  return (
    <DragHandle
      editor={editor}
      computePositionConfig={POSITION}
      nested
      className="editor-drag-handle-root"
    >
      <div
        className="editor-drag-handle"
        role="img"
        aria-label={t("dragBlock")}
      />
    </DragHandle>
  )
}
