"use client"

import { useEffect, useRef, useState } from "react"
import { UploadIcon, VideoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import { acceptAttribute, uploadProblem } from "@/lib/documents/file-types"
import { formatFileSize } from "@/lib/documents/utils"
import { growApi, type AuthorStep, type LessonContent } from "@/lib/grow-api"
import { getImageUrl } from "@/lib/images"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

interface VideoLessonEditorProps {
  step: AuthorStep
  onSaved: (step: AuthorStep) => void
}

interface Upload {
  name: string
  /** 0–1; at 1 the API is still storing the file. */
  progress: number
  abort: AbortController
}

/** The lesson's uploaded video: the upload itself saves the lesson (and replaces any previous video). */
export function VideoLessonEditor({ step, onSaved }: VideoLessonEditorProps) {
  const t = useTranslations("grow.lessonVideo")
  const content = step.content as LessonContent
  const video = content.kind === "video" ? content.video : null
  const input = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<Upload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uploading = upload !== null

  // Closing or reloading the page would cut the upload: the browser asks first.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [uploading])

  const start = async (file: File) => {
    const problem = uploadProblem("video", file)
    setError(problem)
    if (problem) return
    const abort = new AbortController()
    setUpload({ name: file.name, progress: 0, abort })
    try {
      onSaved(
        await growApi.uploadLessonVideo(step.id, file, {
          signal: abort.signal,
          onProgress: (progress) => setUpload((u) => u && { ...u, progress }),
        })
      )
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError"))
        setError(getErrorMessage(err))
    } finally {
      setUpload(null)
    }
  }

  const choose = () => input.current?.click()

  return (
    <div className="flex flex-col gap-3">
      {upload ? (
        <div
          className="flex flex-col gap-3 rounded-lg border p-4"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <VideoIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1 truncate text-sm font-medium">
              {upload.name}
            </div>
            {upload.progress < 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => upload.abort.abort()}
              >
                {t("cancel")}
              </Button>
            )}
          </div>
          <Progress
            value={Math.round(upload.progress * 100)}
            aria-label={t("uploadProgress")}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {upload.progress < 1 ? (
              t("uploading", { percent: upload.progress })
            ) : (
              <>
                <Spinner aria-hidden />
                {t("saving")}
              </>
            )}
          </p>
        </div>
      ) : video ? (
        <>
          <video
            key={video.key}
            src={getImageUrl(video.key) ?? undefined}
            controls
            preload="metadata"
            playsInline
            aria-label={step.title}
            className="aspect-video w-full rounded-lg border bg-black"
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{video.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(video.size)}
              </div>
            </div>
            <Button variant="outline" onClick={choose}>
              <UploadIcon data-icon="inline-start" />
              {t("replace")}
            </Button>
          </div>
        </>
      ) : (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <VideoIcon />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={choose}>
              <UploadIcon data-icon="inline-start" />
              {t("choose")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("limits")}</p>
          </EmptyContent>
        </Empty>
      )}
      {video && !upload && (
        <p className="text-xs text-muted-foreground">{t("limits")}</p>
      )}
      {error && <FieldError>{error}</FieldError>}
      <input
        ref={input}
        type="file"
        accept={acceptAttribute("video")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void start(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
