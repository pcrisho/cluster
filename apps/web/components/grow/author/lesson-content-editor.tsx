"use client"

import { useState } from "react"
import { LinkIcon, PaperclipIcon, TypeIcon, VideoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { AuthorStep, LessonContent } from "@/lib/grow-api"
import { emptyRichText } from "@/lib/rich-text/content"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { CourseEditorState } from "@/components/grow/author/use-course-editor"
import { FilesLessonEditor } from "@/components/grow/author/files-lesson-editor"
import { LessonTextEditor } from "@/components/grow/author/lesson-text-editor"
import { LinkLessonEditor } from "@/components/grow/author/link-lesson-editor"
import { VideoLessonEditor } from "@/components/grow/author/video-lesson-editor"

type Kind = LessonContent["kind"]

const KINDS: {
  value: Kind
  key: KindLabel
  icon: typeof TypeIcon
}[] = [
  { value: "text", key: "text", icon: TypeIcon },
  { value: "video", key: "videoUpload", icon: VideoIcon },
  { value: "link", key: "videoLink", icon: LinkIcon },
  { value: "files", key: "files", icon: PaperclipIcon },
]

type KindLabel = "text" | "videoUpload" | "videoLink" | "files"
const LABEL = {
  text: "text",
  video: "videoUpload",
  link: "videoLink",
  files: "files",
} as const satisfies Record<Kind, KindLabel>

const EMPTY_DOC = JSON.stringify(emptyRichText())

function hasContent(content: LessonContent): boolean {
  if (content.kind === "text") return JSON.stringify(content.doc) !== EMPTY_DOC
  if (content.kind === "link") return content.url.trim() !== ""
  if (content.kind === "video") return true
  return content.files.length > 0
}

interface LessonContentEditorProps {
  courseId: string
  step: AuthorStep
  editor: CourseEditorState
  /** Debounced save of the text (the step editor owns its autosave). */
  onTextChange: (doc: unknown) => void
}

/** What a lesson holds: text, an uploaded video, a video link or files. Switching kind replaces the content, after asking. */
export function LessonContentEditor({
  courseId,
  step,
  editor,
  onTextChange,
}: LessonContentEditorProps) {
  const t = useTranslations("grow")
  const content = step.content as LessonContent
  const [kind, setKind] = useState<Kind>(content.kind)
  const [pending, setPending] = useState<Kind | null>(null)

  const apply = (next: Kind) => {
    setKind(next)
    // A link is saved once a valid one is typed and a video once uploaded; text and files start empty right away.
    if (next === "text")
      void editor.updateStep(step.id, {
        content: { kind: "text", doc: emptyRichText() },
      })
    if (next === "files")
      void editor.updateStep(step.id, { content: { kind: "files", files: [] } })
  }

  const choose = (next: Kind) => {
    if (next === kind) return
    if (content.kind !== next && hasContent(content)) setPending(next)
    else apply(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={kind}
        onValueChange={(value) => value && choose(value as Kind)}
        aria-label={t("contentType")}
      >
        {KINDS.map(({ value, key, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value}>
            <Icon data-icon="inline-start" />
            {t(key)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {kind === "text" && (
        <section aria-label={t("lessonText")} className="px-4 py-2">
          {/* Keyed by kind so switching back starts from what was saved. */}
          <LessonTextEditor
            key={`${step.id}-${content.kind}`}
            initialDoc={content.kind === "text" ? content.doc : null}
            onChange={onTextChange}
          />
        </section>
      )}
      {kind === "video" && (
        <VideoLessonEditor step={step} onSaved={editor.stepSaved} />
      )}
      {kind === "link" && (
        <LinkLessonEditor step={step} onSaved={editor.stepSaved} />
      )}
      {kind === "files" && (
        <FilesLessonEditor courseId={courseId} step={step} editor={editor} />
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceLessonContent")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("replaceLessonDescription", { kind: t(LABEL[content.kind]) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pending) apply(pending)
                setPending(null)
              }}
            >
              {t("replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
