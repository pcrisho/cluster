"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListTreeIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { growApi } from "@/lib/grow-api"
import type { SavingState } from "@/lib/use-entity-autosave"
import { useIsBelow } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { SavingIndicator } from "@/components/shared/saving-indicator"
import { AssignDialog } from "@/components/grow/assign-dialog"
import { PendingReviewsBadge } from "@/components/grow/pending-reviews-badge"
import { CourseActionsMenu } from "@/components/grow/course-actions-menu"
import { CourseStatusBadge } from "@/components/grow/course-status-badge"
import { CourseOutline } from "@/components/grow/author/course-outline"
import { CourseSettingsSheet } from "@/components/grow/author/course-settings-sheet"
import { PublishDialog } from "@/components/grow/author/publish-dialog"
import { StepEditor } from "@/components/grow/author/step-editor"
import { useCourseEditor } from "@/components/grow/author/use-course-editor"

const worst = (states: SavingState[]): SavingState =>
  states.includes("saving")
    ? "saving"
    : states.includes("failed")
      ? "failed"
      : states.includes("saved")
        ? "saved"
        : "idle"

/** The course editor: header with publish and settings, the outline beside the selected step. */
export function CourseEditor({ courseId }: { courseId: string }) {
  const t = useTranslations("grow")
  const editor = useCourseEditor(courseId)
  const { course, error } = editor
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsBelow(1024)
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [pendingReviews, setPendingReviews] = useState(0)

  useEffect(() => {
    growApi
      .listReviews(courseId)
      .then((list) => setPendingReviews(list.length))
      .catch(() => setPendingReviews(0))
  }, [courseId])
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [contentSaving, setContentSaving] = useState<SavingState>("idle")

  useEffect(() => {
    setBreadcrumb([
      { label: "Grow", href: "/grow" },
      { label: t("manage"), href: "/grow/manage" },
      { label: course?.title ?? t("title") },
    ])
  }, [course?.title, setBreadcrumb, t])

  const steps = course?.sections.flatMap((s) => s.steps) ?? []
  const requested = searchParams.get("step")
  // An unknown or deleted step falls back to the first one.
  const selected = steps.find((s) => s.id === requested) ?? steps[0] ?? null

  const select = useCallback(
    (stepId: string) => {
      router.replace(`${pathname}?step=${stepId}`, { scroll: false })
      setOutlineOpen(false)
    },
    [pathname, router]
  )

  if (error) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {error.notFound ? <GraduationCapIcon /> : <TriangleAlertIcon />}
          </EmptyMedia>
          <EmptyTitle>
            {error.notFound ? t("courseNotFound") : t("courseLoadFailed")}
          </EmptyTitle>
          <EmptyDescription>
            {error.notFound ? t("courseMissingEditable") : error.message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {error.notFound ? (
            <Button asChild variant="outline">
              <Link href="/grow/manage">{t("backToManage")}</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void editor.reload()}>
              {t("retry")}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    )
  }

  if (!course) return <EditorSkeleton />

  const outline = (
    <CourseOutline
      editor={editor}
      sections={course.sections}
      selectedStepId={selected?.id ?? null}
      onSelect={select}
    />
  )

  const body = selected ? (
    <StepEditor
      courseId={course.id}
      key={selected.id}
      step={selected}
      editor={editor}
      onContentSaving={setContentSaving}
    />
  ) : (
    <div className="p-6 md:p-10">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>
            {course.sections.length === 0
              ? t("startWithSection")
              : t("addFirstLesson")}
          </EmptyTitle>
          <EmptyDescription>
            {course.sections.length === 0
              ? t("sectionsDescription")
              : t("lessonsDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={async () => {
              const section = course.sections[0] ?? (await editor.addSection())
              select((await editor.addStep(section.id)).id)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {course.sections.length === 0
              ? t("addSectionAndLesson")
              : t("addLesson")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )

  const header = (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
      <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
        <EntityGlyph
          iconType={course.iconType}
          icon={course.icon}
          emoji={course.emoji}
          fallback="graduation"
          size="md"
          className="shrink-0 text-muted-foreground"
        />
        {selected ? (
          <p className="truncate text-lg font-semibold tracking-tight">
            {course.title}
          </p>
        ) : (
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {course.title}
          </h1>
        )}
        <CourseStatusBadge status={course.status} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <SavingIndicator state={worst([editor.savingState, contentSaving])} />
        <PendingReviewsBadge courseId={course.id} count={pendingReviews} />
        <Button asChild variant="ghost" aria-label={t("preview")}>
          <Link href={`/grow/courses/${course.id}?preview=1`}>
            <EyeIcon data-icon="inline-start" />
            <span className="max-sm:hidden">{t("preview")}</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          aria-label={t("assign")}
          onClick={() => setAssignOpen(true)}
        >
          <UsersIcon data-icon="inline-start" />
          <span className="max-sm:hidden">{t("assign")}</span>
        </Button>
        <Button
          variant="ghost"
          aria-label={t("settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon data-icon="inline-start" />
          <span className="max-sm:hidden">{t("settings")}</span>
        </Button>
        {course.status === "DRAFT" && (
          <Button onClick={() => setPublishOpen(true)}>{t("publish")}</Button>
        )}
        <CourseActionsMenu
          course={course}
          onChanged={editor.setSettings}
          onDeleted={() => router.push("/grow/manage")}
        />
      </div>
    </div>
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {header}
      {course.status === "ARCHIVED" && (
        <p className="border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:px-6">
          {t("archivedLearners")}
        </p>
      )}
      {isMobile ? (
        <div className="min-w-0 flex-1">
          <div className="border-b px-4 py-2">
            <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListTreeIcon data-icon="inline-start" />
                  {t("outline")}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>{t("outline")}</SheetTitle>
                  <SheetDescription>{t("outlineDescription")}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto pt-8">
                  {outline}
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {body}
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-auto flex-1"
          style={{ overflow: "visible" }}
        >
          <ResizablePanel
            id="outline"
            defaultSize="300px"
            minSize="220px"
            maxSize="480px"
            groupResizeBehavior="preserve-pixel-size"
            style={{ overflow: "visible" }}
          >
            <aside className="sticky top-16 h-[calc(100svh-4rem)]">
              {outline}
            </aside>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="step" style={{ overflow: "visible" }}>
            {body}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <CourseSettingsSheet
        course={course}
        editor={editor}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <AssignDialog
        course={course}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
      <PublishDialog
        course={course}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={editor.setSettings}
        onSelectStep={select}
      />
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <Skeleton className="size-6 rounded" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>
      <div className="flex flex-1">
        <div className="hidden w-72 shrink-0 flex-col gap-2 border-r p-3 lg:flex">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 md:p-10">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}
