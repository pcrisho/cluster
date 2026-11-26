"use client"

import { useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import {
  growApi,
  type AuthorCourse,
  type CourseSettings,
  type PublishProblem,
} from "@/lib/grow-api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

interface PublishDialogProps {
  course: AuthorCourse
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished: (course: CourseSettings) => void
  /** Opens the step a problem points at. */
  onSelectStep: (stepId: string) => void
}

/** Says what publishing does; when the course is not ready, lists every problem with a link to its step. */
export function PublishDialog({
  course,
  open,
  onOpenChange,
  onPublished,
  onSelectStep,
}: PublishDialogProps) {
  const t = useTranslations("grow.publishDialog")
  const [problems, setProblems] = useState<PublishProblem[]>([])
  const [busy, setBusy] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) setProblems([])
    onOpenChange(next)
  }

  const publish = async () => {
    setBusy(true)
    try {
      onPublished(await growApi.publishCourse(course.id))
      handleOpenChange(false)
    } catch (err) {
      const details =
        err instanceof ApiError
          ? (err.details as { problems?: PublishProblem[] } | undefined)
          : undefined
      if (details?.problems?.length) setProblems(details.problems)
      else toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const problemText = (problem: PublishProblem) => {
    switch (problem.code) {
      case "NO_STEPS":
        return t("noSteps")
      case "QUIZ_NEEDS_QUESTION":
        return t("quizNeedsQuestion", { title: problem.title })
      case "QUIZ_BANK_TOO_LARGE":
        return t("quizBankTooLarge", {
          title: problem.title,
          bankSize: problem.bankSize,
          questionCount: problem.questionCount,
        })
      case "QUIZ_PASS_SCORE_INVALID":
        return t("quizPassScoreInvalid", { title: problem.title })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("title", { course: course.title })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {course.restricted
              ? t("restrictedDescription")
              : t("catalogDescription")}{" "}
            {t("mandatoryNotification")} {t("archivedNotDeleted")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problems.length > 0 && (
          <Alert variant="destructive" aria-live="polite">
            <TriangleAlertIcon />
            <AlertTitle>{t("fixBeforePublishing")}</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 flex flex-col gap-1">
                {problems.map((p, i) => (
                  <li key={i}>
                    {"stepId" in p ? (
                      <button
                        type="button"
                        className="text-left underline underline-offset-2 hover:no-underline"
                        onClick={() => {
                          onSelectStep(p.stepId)
                          handleOpenChange(false)
                        }}
                      >
                        {problemText(p)}
                      </button>
                    ) : (
                      problemText(p)
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <Button
            onClick={() => void publish()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? t("publishing") : t("publishCourse")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
