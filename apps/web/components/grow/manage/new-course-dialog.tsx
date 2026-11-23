"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api"
import { growApi } from "@/lib/grow-api"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import {
  EntityIconPicker,
  type IconValue,
} from "@/components/shared/entity-icon-picker"

const DEFAULT_ICON: IconValue = {
  iconType: "LUCIDE",
  icon: "graduation",
  emoji: null,
}

/** Creates a draft course and opens it in the editor. */
export function NewCourseDialog({ children }: { children: React.ReactNode }) {
  const t = useTranslations("grow.newCourse")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState<IconValue>(DEFAULT_ICON)
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return
    setOpen(next)
    if (!next) {
      setTitle("")
      setDescription("")
      setIcon(DEFAULT_ICON)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setIsSaving(true)
    try {
      const course = await growApi.createCourse({
        title: title.trim(),
        description: description.trim() || undefined,
        iconType: icon.iconType,
        ...(icon.iconType === "EMOJI"
          ? { emoji: icon.emoji ?? undefined }
          : { icon: icon.icon }),
      })
      router.push(`/grow/courses/${course.id}/edit`)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <FieldGroup data-disabled={isSaving}>
            <Field>
              <FieldLabel htmlFor="course-title">{t("courseTitle")}</FieldLabel>
              <div className="flex items-center gap-2">
                <EntityIconPicker
                  current={icon}
                  onChange={setIcon}
                  onRemove={() => setIcon(DEFAULT_ICON)}
                  disabled={isSaving}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={isSaving}
                    aria-label={t("chooseIcon")}
                  >
                    <EntityGlyph
                      iconType={icon.iconType}
                      icon={icon.icon}
                      emoji={icon.emoji}
                      fallback="graduation"
                    />
                  </Button>
                </EntityIconPicker>
                <Input
                  id="course-title"
                  placeholder={t("titlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  autoFocus
                  disabled={isSaving}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="course-description">
                {t("courseDescription")}
              </FieldLabel>
              <Textarea
                id="course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={2000}
                rows={5}
                className="min-h-32 resize-y"
                disabled={isSaving}
                aria-describedby="course-description-hint"
              />
              <FieldDescription
                id="course-description-hint"
                className="flex justify-between gap-4"
              >
                <span>{t("descriptionHint")}</span>
                <span className="shrink-0 tabular-nums">
                  {t("characterCount", {
                    count: description.length,
                    max: 2000,
                  })}
                </span>
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => handleOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !title.trim()}
              aria-busy={isSaving}
            >
              {isSaving && <Spinner data-icon="inline-start" />}
              {isSaving ? t("creating") : t("createCourse")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
