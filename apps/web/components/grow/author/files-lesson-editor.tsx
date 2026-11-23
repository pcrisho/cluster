"use client"

import { useRef, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  FileIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { getErrorMessage } from "@/lib/api"
import {
  growApi,
  type AuthorStep,
  type LessonContent,
  type LessonFile,
} from "@/lib/grow-api"
import { getImageUrl } from "@/lib/images"
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
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldError } from "@/components/ui/field"
import type { CourseEditorState } from "@/components/grow/author/use-course-editor"
import { FilesLessonEmptyState } from "@/components/grow/author/files-lesson-empty-state"

const MAX_BYTES = 50 * 1024 * 1024
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"

interface FilesLessonEditorProps {
  courseId: string
  step: AuthorStep
  editor: CourseEditorState
}

/** Documents attached to a lesson: upload (50 MB, documents only), reorder and remove. */
export function FilesLessonEditor({
  courseId,
  step,
  editor,
}: FilesLessonEditorProps) {
  const t = useTranslations("grow.lessonFiles")
  const locale = useLocale()
  const content = step.content as LessonContent
  const files = content.kind === "files" ? content.files : []
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<LessonFile | null>(null)

  const save = (next: LessonFile[]) =>
    editor.updateStep(step.id, { content: { kind: "files", files: next } })

  const upload = async (picked: File[]) => {
    setError(null)
    const tooBig = picked.filter((f) => f.size > MAX_BYTES)
    if (tooBig.length)
      setError(t("tooLarge", { files: tooBig.map((f) => f.name).join(", ") }))
    let next = files
    for (const file of picked.filter((f) => f.size <= MAX_BYTES)) {
      setUploading((u) => [...u, file.name])
      try {
        next = [...next, await growApi.uploadCourseFile(courseId, file)]
        await save(next)
      } catch (err) {
        setError(`${file.name}: ${getErrorMessage(err)}`)
      } finally {
        setUploading((u) => u.filter((name) => name !== file.name))
      }
    }
  }

  const move = (index: number, by: number) => {
    const next = [...files]
    const [file] = next.splice(index, 1)
    next.splice(index + by, 0, file)
    void save(next)
  }

  const size = (bytes: number) => {
    const units = ["B", "KB", "MB"]
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit += 1
    }
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: unit === 2 ? 1 : 0,
    }).format(value)} ${units[unit]}`
  }

  const isEmpty = files.length === 0 && uploading.length === 0

  return (
    <div className="flex flex-col gap-3">
      {isEmpty && (
        <FilesLessonEmptyState onSelect={() => input.current?.click()} />
      )}
      <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
        {files.map((file, index) => (
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
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={t("download", { name: file.name })}
            >
              <a href={getImageUrl(file.key) ?? "#"} download={file.name}>
                <DownloadIcon />
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("actions", { name: file.name })}
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={index === 0}
                  onSelect={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                  {t("moveUp")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === files.length - 1}
                  onSelect={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                  {t("moveDown")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setRemoving(file)}
                >
                  <Trash2Icon />
                  {t("removeFromLesson")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {uploading.map((name) => (
          <li
            key={name}
            className="flex items-center gap-3 p-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Spinner className="shrink-0" aria-hidden />
            {t("uploading", { name })}
          </li>
        ))}
      </ul>
      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => input.current?.click()}
            disabled={files.length + uploading.length >= 20}
          >
            <UploadIcon data-icon="inline-start" />
            {t("upload")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("fileLimits")}
          </span>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeTitle", { name: removing?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing)
                  void save(files.filter((f) => f.key !== removing.key))
              }}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
