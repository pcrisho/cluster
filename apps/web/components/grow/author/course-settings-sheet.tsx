"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import type { AuthorCourse } from "@/lib/grow-api"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { EntityIconPicker } from "@/components/shared/entity-icon-picker"
import type { CourseEditorState } from "@/components/grow/author/use-course-editor"

interface CourseSettingsSheetProps {
  course: AuthorCourse
  editor: CourseEditorState
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Title, description, icon and the course switches; every field saves on its own. */
export function CourseSettingsSheet({
  course,
  editor,
  open,
  onOpenChange,
}: CourseSettingsSheetProps) {
  const t = useTranslations("grow")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("courseSettings")}</SheetTitle>
          <SheetDescription>{t("changesSaveAutomatically")}</SheetDescription>
        </SheetHeader>
        {/* Keyed by open so the fields start from the saved values each time. */}
        {open && (
          <SettingsFields key={course.id} course={course} editor={editor} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SettingsFields({
  course,
  editor,
}: {
  course: AuthorCourse
  editor: CourseEditorState
}) {
  const t = useTranslations("grow")
  const { user } = useAuth()
  const isolated = user?.organization.isolated ?? false
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description ?? "")
  const { updateCourse } = editor

  const saveTitle = () => {
    const next = title.trim()
    if (!next) return setTitle(course.title)
    if (next !== course.title) void updateCourse({ title: next })
  }
  const saveDescription = () => {
    const next = description.trim()
    if (next !== (course.description ?? ""))
      void updateCourse({ description: next === "" ? null : next })
  }

  return (
    <FieldGroup className="px-4 pb-6">
      <Field>
        <FieldLabel htmlFor="course-settings-title">{t("title")}</FieldLabel>
        <div className="flex items-center gap-2">
          <EntityIconPicker
            current={course}
            onChange={(icon) => void updateCourse(icon)}
            onRemove={() =>
              void updateCourse({
                iconType: "LUCIDE",
                icon: "graduation",
                emoji: null,
              })
            }
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("changeCourseIcon")}
            >
              <EntityGlyph
                iconType={course.iconType}
                icon={course.icon}
                emoji={course.emoji}
                fallback="graduation"
              />
            </Button>
          </EntityIconPicker>
          <Input
            id="course-settings-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
          />
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="course-settings-description">
          {t("description")}
        </FieldLabel>
        <Textarea
          id="course-settings-description"
          rows={5}
          maxLength={2000}
          value={description}
          placeholder={t("courseDescriptionPlaceholder")}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
        />
        <FieldDescription>{description.length} / 2000</FieldDescription>
      </Field>
      <SwitchField
        id="course-sequential"
        label={t("sequentialOrder")}
        description={t("sequentialDescription")}
        checked={course.sequential}
        onChange={(sequential) => void updateCourse({ sequential })}
      />
      <SwitchField
        id="course-restricted"
        label={t("restricted")}
        description={t("restrictedDescription")}
        checked={course.restricted}
        onChange={(restricted) => void updateCourse({ restricted })}
      />
      {isolated && !course.restricted && (
        <FieldDescription>{t("visibleToEveryMainNode")}</FieldDescription>
      )}
      <SwitchField
        id="course-certificate"
        label={t("issuesCertificate")}
        description={t("certificateDescription")}
        checked={course.issuesCertificate}
        onChange={(issuesCertificate) =>
          void updateCourse({ issuesCertificate })
        }
      />
    </FieldGroup>
  )
}

function SwitchField(props: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
        <FieldDescription>{props.description}</FieldDescription>
      </FieldContent>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onChange}
      />
    </Field>
  )
}
