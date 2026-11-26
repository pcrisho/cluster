"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { ApiError, getErrorMessage } from "@/lib/api"
import { growApi, type AuthorStep, type LessonContent } from "@/lib/grow-api"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const SERVICES =
  "YouTube, Vimeo, Google Drive, OneDrive, SharePoint (Stream and Teams recordings) or Loom"

interface LinkLessonEditorProps {
  step: AuthorStep
  onSaved: (step: AuthorStep) => void
}

/** A video link checked against the allowed services as it is typed (the API decides), with a preview. */
export function LinkLessonEditor({ step, onSaved }: LinkLessonEditorProps) {
  const t = useTranslations("grow.lessonLink")
  const content = step.content as LessonContent
  const saved = content.kind === "link" ? content : null
  const [url, setUrl] = useState(saved?.url ?? "")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const lastSent = useRef(saved?.url ?? "")

  useEffect(() => {
    const value = url.trim()
    if (value === lastSent.current) return
    const timer = setTimeout(async () => {
      if (!value) return setError(null)
      lastSent.current = value
      setChecking(true)
      try {
        onSaved(
          await growApi.updateStep(step.id, {
            content: { kind: "link", url: value },
          })
        )
        setError(null)
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 400
            ? t("unsupportedLink", { services: SERVICES })
            : getErrorMessage(err)
        )
      } finally {
        setChecking(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [url, step.id, onSaved, t])

  const embed =
    saved?.embedUrl && saved.url === url.trim() ? saved.embedUrl : null

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="lesson-link">{t("label")}</FieldLabel>
        <div className="relative">
          <Input
            id="lesson-link"
            type="url"
            inputMode="url"
            placeholder={t("placeholder")}
            value={url}
            aria-invalid={!!error}
            aria-describedby="lesson-link-help"
            onChange={(e) => setUrl(e.target.value)}
          />
          {checking && (
            <Spinner
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
              aria-label={t("checking")}
            />
          )}
        </div>
        {error ? (
          <FieldError id="lesson-link-help">{error}</FieldError>
        ) : (
          <FieldDescription id="lesson-link-help">
            {t("help", { services: SERVICES })}
          </FieldDescription>
        )}
      </Field>
      {embed && (
        <div className="flex flex-col gap-2">
          <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
            <iframe
              src={embed}
              title={t("previewTitle", { title: step.title })}
              className="size-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              allow="fullscreen; picture-in-picture; encrypted-media"
            />
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {t("previewHelp")}{" "}
            <a
              href={url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {t("openInNewTab")}
              <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
