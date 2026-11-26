"use client"

import { useEffect, useState } from "react"
import { FileTextIcon, ListChecksIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import {
  growApi,
  type AuthorStep,
  type LessonContent,
  type QuizContent,
} from "@/lib/grow-api"
import { useEntityAutosave, type SavingState } from "@/lib/use-entity-autosave"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { CourseEditorState } from "@/components/grow/author/use-course-editor"
import { LessonContentEditor } from "@/components/grow/author/lesson-content-editor"
import { QuizBuilder } from "@/components/grow/author/quiz-builder"

interface StepEditorProps {
  courseId: string
  step: AuthorStep
  editor: CourseEditorState
  /** The content autosave state, shown in the editor header. */
  onContentSaving: (state: SavingState) => void
}

/** Title, duration and required flag of a step, and its content. Mounted per step (keyed by id). */
export function StepEditor({
  courseId,
  step,
  editor,
  onContentSaving,
}: StepEditorProps) {
  const t = useTranslations("grow")
  const [title, setTitle] = useState(step.title)
  const [duration, setDuration] = useState(
    step.durationMinutes?.toString() ?? ""
  )
  const isQuiz = step.type === "QUIZ"
  const Icon = isQuiz ? ListChecksIcon : FileTextIcon

  const { stepSaved } = editor
  const content = useEntityAutosave<LessonContent | QuizContent>({
    save: async (value) =>
      stepSaved(await growApi.updateStep(step.id, { content: value })),
  })
  useEffect(
    () => onContentSaving(content.state),
    [content.state, onContentSaving]
  )

  const saveTitle = () => {
    const next = title.trim()
    if (!next) return setTitle(step.title)
    if (next !== step.title) void editor.updateStep(step.id, { title: next })
  }

  const saveDuration = () => {
    const minutes = duration.trim() === "" ? null : Number(duration)
    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
    ) {
      return setDuration(step.durationMinutes?.toString() ?? "")
    }
    if (minutes !== step.durationMinutes)
      void editor.updateStep(step.id, { durationMinutes: minutes })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {isQuiz ? t("quiz") : t("lesson")}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="step-title">{t("title")}</FieldLabel>
          <h1
            className="text-2xl font-semibold tracking-tight"
            aria-label={title}
          >
            <Input
              id="step-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-2xl dark:bg-transparent"
            />
          </h1>
        </Field>
        <div className="flex flex-wrap items-end gap-6">
          {!isQuiz && (
            <Field className="w-36">
              <FieldLabel htmlFor="step-duration">
                {t("durationMinutes")}
              </FieldLabel>
              <Input
                id="step-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                placeholder="—"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={saveDuration}
              />
            </Field>
          )}
          <Field orientation="horizontal" className="w-auto">
            <Switch
              id="step-required"
              checked={step.required}
              onCheckedChange={(required) =>
                void editor.updateStep(step.id, { required })
              }
            />
            <FieldLabel htmlFor="step-required">
              {t("requiredToComplete")}
            </FieldLabel>
          </Field>
        </div>
      </FieldGroup>

      {isQuiz ? (
        <QuizBuilder
          initial={step.content as QuizContent}
          onSave={content.trigger}
        />
      ) : (
        <LessonContentEditor
          courseId={courseId}
          step={step}
          editor={editor}
          onTextChange={(doc) => content.trigger({ kind: "text", doc })}
        />
      )}
    </div>
  )
}
