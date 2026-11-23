"use client"

import { useCallback, useInsertionEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { uploadBodyImage } from "@/lib/images"
import { parseRichText, serializeRichText } from "@/lib/rich-text/content"
import { RichTextEditor } from "@/components/shared/rich-text-editor/RichTextEditor"

interface LessonTextEditorProps {
  initialDoc: unknown
  onChange: (doc: unknown) => void
}

/**
 * The text of a lesson, edited with the shared editor (not collaborative). Mount it keyed by the
 * step: the document is pinned on mount so saves never reset what the author is typing.
 */
export function LessonTextEditor({
  initialDoc,
  onChange,
}: LessonTextEditorProps) {
  const t = useTranslations("grow.lessonEditor")
  const [initial] = useState(() => serializeRichText(initialDoc))
  const onChangeRef = useRef(onChange)
  useInsertionEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const handleChange = useCallback(
    (raw: string) => onChangeRef.current(parseRichText(raw)),
    []
  )

  return (
    <RichTextEditor
      initialContent={initial}
      onChange={handleChange}
      onImageUpload={uploadBodyImage}
      pageMentions={false}
      placeholder={t("placeholder")}
    />
  )
}
