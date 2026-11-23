"use client"

import {
  memo,
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
} from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"

import { BubbleToolbar } from "@/components/shared/rich-text-editor/BubbleToolbar"
import { EditorDragHandle } from "@/components/shared/rich-text-editor/EditorDragHandle"
import { parseRichText, serializeRichText } from "@/lib/rich-text/content"
import {
  useEditorExtensions,
  type EditorCallbacks,
} from "@/components/shared/rich-text-editor/use-editor-extensions"
import type { RichTextDoc } from "@/lib/rich-text/types"

export interface RichTextEditorProps extends EditorCallbacks {
  /** Serialized rich-text document (JSON string). */
  initialContent: string
  /** Called on every user edit with the serialized document. */
  onChange: (serialized: string) => void
  /** Defaults to true. Set to false for a read-only preview. */
  editable?: boolean
  /** Placeholder shown when the editor is empty. */
  placeholder?: string
  className?: string
  /** The `@` popup that links KNOW pages; default on. */
  pageMentions?: boolean
}

/** Module constant: useEditor calls setOptions() whenever this identity changes. */
export const EDITOR_PROPS = {
  attributes: {
    class:
      "prose prose-base prose-headings:font-title focus:outline-none max-w-none min-h-[120px] py-2",
  },
}

/** Read-only content is text to read, not a field: without this Tiptap announces it as an edit box. */
const READ_ONLY_PROPS = {
  attributes: { ...EDITOR_PROPS.attributes, role: "presentation" },
}

const EMPTY_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
}

function parseInitial(raw: string): RichTextDoc {
  return parseRichText(raw) ?? EMPTY_DOC
}

export const RichTextEditor = memo(function RichTextEditor({
  initialContent,
  onChange,
  editable = true,
  placeholder,
  onImageUpload,
  onFileUpload,
  onCreatePage,
  className,
  pageMentions,
}: RichTextEditorProps) {
  // Pin the initial document on mount via a ref so subsequent
  // re-renders of the parent (which often re-serialise to a new
  // JSON string for the SAME content) do NOT cause the editor to
  // reset and fire `onUpdate`, which would re-trigger autosave
  // and create a save loop.
  const mountContentRef = useRef<string>(initialContent ?? "")
  const initialDoc = useMemo(() => parseInitial(mountContentRef.current), [])

  // The last value we forwarded to the parent. We compare
  // onUpdate's payload to this to detect echoes: if Tiptap emits
  // an onUpdate whose content is the SAME content we already
  // propagated, it is not a user edit — drop it.
  const lastForwardedRef = useRef<string | null>(null)

  // Keep the latest onChange in a ref so the handleUpdate
  // callback can be stably memoised (otherwise Tiptap re-binds
  // the onUpdate listener on every parent re-render, which
  // causes the "saving forever" loop).
  const onChangeRef = useRef(onChange)
  useInsertionEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const handleUpdate = useCallback(({ editor }: { editor: Editor }) => {
    const next = serializeRichText(editor.getJSON())
    if (next === mountContentRef.current) return
    if (next === lastForwardedRef.current) return
    lastForwardedRef.current = next
    onChangeRef.current(next)
  }, [])

  const extensions = useEditorExtensions({
    placeholder,
    pageMentions,
    onImageUpload,
    onFileUpload,
    onCreatePage,
  })
  const editor = useEditor({
    extensions,
    content: initialDoc,
    editable,
    immediatelyRender: false,
    editorProps: editable ? EDITOR_PROPS : READ_ONLY_PROPS,
    onUpdate: handleUpdate,
  })

  // `editable` is not re-applied from the options after creation.
  // `setEditable` must not emit an update: that would be an echo.
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
})
