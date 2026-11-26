"use client"

import { useEffect, useRef, useState, type SyntheticEvent } from "react"
import { DownloadIcon, ExternalLinkIcon, FileIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { LessonContent, LessonFile } from "@/lib/grow-api"
import { getImageUrl } from "@/lib/images"
import { serializeRichText } from "@/lib/rich-text/content"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/shared/rich-text-editor/RichTextEditor"

const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** What unlocks "Mark as complete" for each kind of lesson (D14), shown under the button until then. */
export const READY_HINT = {
  text: "readyText",
  video: "readyVideo",
  link: "readyLink",
  files: "readyFiles",
} as const satisfies Record<
  LessonContent["kind"],
  "readyText" | "readyVideo" | "readyLink" | "readyFiles"
>

/** Share of an uploaded video that counts as watched (D14; owner, 2026-11-02). */
const WATCHED = 0.9

/**
 * A lesson's content, read-only. `onReady` fires once the learner has been through it: the end of
 * the text came into view (at once if it fits), 90 % of an uploaded video played, a linked video's
 * frame loaded or opened in a new tab, or a file was opened.
 */
export function LessonView({
  content,
  title,
  onReady,
}: {
  content: LessonContent
  title: string
  onReady: () => void
}) {
  const t = useTranslations("grow.lessonView")
  if (content.kind === "text")
    return <TextLesson doc={content.doc} onReady={onReady} />
  if (content.kind === "video")
    return (
      <VideoLesson
        key={content.video.key}
        video={content.video}
        title={title}
        onReady={onReady}
      />
    )
  if (content.kind === "link")
    return (
      <div className="flex flex-col gap-3">
        {content.embedUrl ? (
          <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
            <iframe
              src={content.embedUrl}
              title={title}
              className="size-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              allow="fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              onLoad={onReady}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("videoUnavailable")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Button asChild variant="outline" size="sm">
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onReady}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {t("openInNewTab")}
            </a>
          </Button>
          {t("videoHelp")}
        </div>
      </div>
    )
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {content.files.map((file) => (
        <li key={file.key} className="flex items-center gap-3 p-3">
          <FileIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {size(file.size)}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href={getImageUrl(file.key) ?? "#"}
              download={file.name}
              onClick={onReady}
            >
              <DownloadIcon data-icon="inline-start" />
              {t("download")}
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Played from /files with byte ranges; ready once 90 % of it played (seeking there counts too, as D14 is browser-only). */
function VideoLesson({
  video,
  title,
  onReady,
}: {
  video: LessonFile
  title: string
  onReady: () => void
}) {
  const t = useTranslations("grow.lessonView")
  const [failed, setFailed] = useState(false)
  const done = useRef(false)
  const url = getImageUrl(video.key) ?? undefined

  const check = (e: SyntheticEvent<HTMLVideoElement>) => {
    const { currentTime, duration } = e.currentTarget
    if (done.current || !(duration > 0) || currentTime < duration * WATCHED)
      return
    done.current = true
    onReady()
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        aria-label={title}
        className="aspect-video w-full rounded-lg border bg-black"
        onTimeUpdate={check}
        onEnded={check}
        onError={() => setFailed(true)}
      />
      {failed && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {t("videoCannotPlay")}
          <Button asChild variant="outline" size="sm">
            <a href={url ?? "#"} download={video.name}>
              <DownloadIcon data-icon="inline-start" />
              {t("download")}
            </a>
          </Button>
        </div>
      )}
    </div>
  )
}

function TextLesson({ doc, onReady }: { doc: unknown; onReady: () => void }) {
  const [initial] = useState(() => serializeRichText(doc))
  const end = useRef<HTMLDivElement>(null)
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  }, [onReady])

  useEffect(() => {
    const sentinel = end.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ready.current()
          observer.disconnect()
        }
      },
      // The sticky action bar covers the bottom of the viewport.
      { rootMargin: "0px 0px -80px 0px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <div>
      <RichTextEditor
        initialContent={initial}
        editable={false}
        onChange={() => {
          /* read-only */
        }}
        pageMentions={false}
      />
      <div ref={end} aria-hidden className="h-px" />
    </div>
  )
}
