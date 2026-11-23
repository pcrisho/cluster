"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArchiveIcon,
  UsersIcon,
  ArchiveRestoreIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api"
import { growApi, type CourseSettings } from "@/lib/grow-api"
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
import { AssignDialog } from "@/components/grow/assign-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Confirm = "archive" | "delete" | null

interface CourseActionsMenuProps {
  course: Pick<CourseSettings, "id" | "title" | "status" | "publishedAt">
  /** Show "Edit" and "Assign" (the list); the editor has its own buttons for them. */
  withEdit?: boolean
  onChanged: (course: CourseSettings) => void
  onDeleted: () => void
}

/** Edit, archive or restore, and delete (only drafts that were never published), each confirmed. */
export function CourseActionsMenu({
  course,
  withEdit,
  onChanged,
  onDeleted,
}: CourseActionsMenuProps) {
  const t = useTranslations("grow.courseActions")
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const deletable = course.publishedAt === null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setConfirm(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const restore = () =>
    run(async () => {
      onChanged(await growApi.restoreCourse(course.id))
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("actionsForCourse", { course: course.title })}
            disabled={busy}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {withEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/grow/courses/${course.id}/edit`}>
                <PencilIcon />
                {t("edit")}
              </Link>
            </DropdownMenuItem>
          )}
          {withEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/grow/courses/${course.id}?preview=1`}>
                <EyeIcon />
                {t("previewAsLearner")}
              </Link>
            </DropdownMenuItem>
          )}
          {withEdit && (
            <DropdownMenuItem onSelect={() => setAssignOpen(true)}>
              <UsersIcon />
              {t("assign")}
            </DropdownMenuItem>
          )}
          {course.status === "PUBLISHED" && (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              <ArchiveIcon />
              {t("archive")}
            </DropdownMenuItem>
          )}
          {course.status === "ARCHIVED" && (
            <DropdownMenuItem onSelect={() => void restore()}>
              <ArchiveRestoreIcon />
              {t("restore")}
            </DropdownMenuItem>
          )}
          {deletable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirm("delete")}
              >
                <Trash2Icon />
                {t("delete")}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("publishedDeleteNotice")}
              </DropdownMenuLabel>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? t("deleteTitle", { course: course.title })
                : t("archiveTitle", { course: course.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? t("deleteDescription")
                : t("archiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                if (confirm === "delete") {
                  void run(async () => {
                    await growApi.deleteCourse(course.id)
                    onDeleted()
                  })
                } else {
                  void run(async () => {
                    onChanged(await growApi.archiveCourse(course.id))
                  })
                }
              }}
            >
              {confirm === "delete" ? t("deleteCourse") : t("archiveCourse")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {withEdit && (
        <AssignDialog
          course={course}
          open={assignOpen}
          onOpenChange={setAssignOpen}
        />
      )}
    </>
  )
}
