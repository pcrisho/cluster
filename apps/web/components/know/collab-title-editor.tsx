"use client"

import { useEffect, useMemo } from "react"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, useEditor } from "@tiptap/react"
import type * as Y from "yjs"
import { titleExtensions } from "@cluster/editor-schema"
import { tPlain } from "@/lib/i18n/plain"

const EDITOR_PROPS = {
  attributes: {
    class:
      "w-full text-[2.5rem] leading-[1.15] font-bold tracking-tight focus:outline-none",
  },
}

/**
 * The page title as a one-line live editor (Yjs fragment `title`). Enter does nothing: the schema
 * allows a single paragraph.
 */
export function CollabTitleEditor({
  ydoc,
  editable,
  onTitleChange,
}: {
  ydoc: Y.Doc
  editable: boolean
  /** Plain text of the title after every change, local or remote. */
  onTitleChange?: (title: string) => void
}) {
  const extensions = useMemo(
    () => [
      ...titleExtensions,
      Collaboration.configure({ document: ydoc, field: "title" }),
      Placeholder.configure({ placeholder: tPlain("know.untitled") }),
    ],
    [ydoc]
  )
  const editor = useEditor(
    {
      extensions,
      editable,
      immediatelyRender: false,
      editorProps: EDITOR_PROPS,
      onUpdate: ({ editor }) => onTitleChange?.(editor.getText()),
    },
    [extensions]
  )

  useEffect(() => {
    editor?.setEditable(editable, false)
  }, [editor, editable])

  return <EditorContent editor={editor} />
}
