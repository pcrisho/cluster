"use client"

import { useEffect, useMemo } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"
import { EditorContent, useEditor } from "@tiptap/react"
import type * as Y from "yjs"

import { BubbleToolbar } from "@/components/shared/rich-text-editor/BubbleToolbar"
import { EditorDragHandle } from "@/components/shared/rich-text-editor/EditorDragHandle"
import { EDITOR_PROPS } from "@/components/shared/rich-text-editor/RichTextEditor"
import {
  useEditorExtensions,
  type EditorCallbacks,
} from "@/components/shared/rich-text-editor/use-editor-extensions"

export interface CollaborativeEditorProps extends EditorCallbacks {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  /** False while read-only or offline. */
  editable: boolean
  placeholder?: string
  className?: string
}

/**
 * The page body as a live Yjs fragment (`body`). The document comes from the server, so there is
 * no `content` and no `onChange`; a new `ydoc` or `provider` (see `generation`) rebuilds the editor.
 */
export function CollaborativeEditor({
  ydoc,
  provider,
  editable,
  placeholder,
  className,
  ...callbacks
}: CollaborativeEditorProps) {
  // The server overwrites `user` in awareness with the identity it authenticated.
  const live = useMemo(
    () => [
      Collaboration.configure({ document: ydoc, field: "body" }),
      CollaborationCaret.configure({ provider, user: { name: "", color: "" } }),
    ],
    [ydoc, provider]
  )
  const extensions = useEditorExtensions({
    ...callbacks,
    placeholder,
    extra: live,
    collaborative: true,
  })

  const editor = useEditor(
    {
      extensions,
      editable,
      immediatelyRender: false,
      editorProps: EDITOR_PROPS,
    },
    [extensions]
  )

  // `editable` is not re-applied from the options after creation.
  useEffect(() => {
    editor?.setEditable(editable, false)
  }, [editor, editable])

  return (
    <>
      <EditorContent editor={editor} className={className ?? "w-full"} />
      {editor && <BubbleToolbar editor={editor} />}
      {editor && <EditorDragHandle editor={editor} />}
    </>
  )
}
