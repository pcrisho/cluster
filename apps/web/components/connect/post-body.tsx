"use client"

import { useState, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  parseRichText,
  extractPlainTextFromContent,
} from "@/lib/rich-text/content"
import { renderRichText } from "@/lib/rich-text/render"
import { useTranslations } from "next-intl"

interface PostBodyProps {
  /** Post body: a serialized TipTap document (the API validates it against the editor schema). */
  body: string
  className?: string
  maxChars?: number
}

export function PostBody({ body, className, maxChars = 300 }: PostBodyProps) {
  const t = useTranslations("connect.feed")
  const [expanded, setExpanded] = useState(false)

  const textContent = useMemo(
    () => extractPlainTextFromContent(parseRichText(body), 9999) ?? "",
    [body]
  )
  // The shared renderer emits only schema nodes and sanitizes with DOMPurify in the browser.
  const html = useMemo(() => renderRichText(body), [body])

  const isLong = textContent.length > maxChars

  const toggle = useCallback(() => setExpanded((prev) => !prev), [])

  return (
    <div className={className}>
      <div
        className={cn(
          "prose prose-sm max-w-none break-words",
          !expanded && isLong && "line-clamp-5"
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isLong && (
        <button
          type="button"
          onClick={toggle}
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  )
}
