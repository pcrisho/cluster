"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  FolderInputIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import type { AuthorSection, AuthorStep, StepType } from "@/lib/grow-api"
import { cn } from "@/lib/utils"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CourseEditorState } from "@/components/grow/author/use-course-editor"
import { TextPromptDialog } from "@/components/grow/author/text-prompt-dialog"

/** Why a step would block publishing, if it would. */
export function stepProblem(
  step: AuthorStep
):
  | { key: "quizNeedsQuestion" }
  | { key: "questionBankTooSmall"; bankSize: number; count: number }
  | null {
  if (step.type !== "QUIZ") return null
  const quiz = step.content as {
    questions?: unknown[]
    bankSize?: number | null
  }
  const count = quiz.questions?.length ?? 0
  if (count === 0) return { key: "quizNeedsQuestion" }
  if (quiz.bankSize && quiz.bankSize > count)
    return {
      key: "questionBankTooSmall",
      bankSize: quiz.bankSize,
      count,
    }
  return null
}

type Pending =
  | { kind: "rename"; section: AuthorSection }
  | { kind: "delete-section"; section: AuthorSection }
  | { kind: "delete-step"; step: AuthorStep }
  | null

interface CourseOutlineProps {
  editor: CourseEditorState
  sections: AuthorSection[]
  selectedStepId: string | null
  onSelect: (stepId: string) => void
}

/** Sections and their steps. Reorder and move through each row's menu, like the KNOW page tree. */
export function CourseOutline({
  editor,
  sections,
  selectedStepId,
  onSelect,
}: CourseOutlineProps) {
  const t = useTranslations("grow")
  const [pending, setPending] = useState<Pending>(null)

  const addStep = async (sectionId: string, type: StepType) =>
    onSelect((await editor.addStep(sectionId, type)).id)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center justify-between pl-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("outline")}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("addSection")}
          onClick={() => void editor.addSection()}
        >
          <PlusIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {sections.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t("noSections")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {sections.map((section, sIndex) => (
              <li key={section.id} className="flex flex-col gap-0.5">
                <div className="group/row flex items-center gap-1 rounded-md pr-1 pl-2">
                  <span className="min-w-0 flex-1 truncate py-1 text-sm font-medium">
                    {sIndex + 1}. {section.title}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("actionsForSection", {
                          title: section.title,
                        })}
                        className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      <DropdownMenuItem
                        onSelect={() => void addStep(section.id, "LESSON")}
                      >
                        <FileTextIcon />
                        {t("addLesson")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => void addStep(section.id, "QUIZ")}
                      >
                        <ListChecksIcon />
                        {t("addQuiz")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setPending({ kind: "rename", section })}
                      >
                        <PencilIcon />
                        {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={sIndex === 0}
                        onSelect={() =>
                          void editor.moveSection(section.id, sIndex - 1)
                        }
                      >
                        <ArrowUpIcon />
                        {t("moveUp")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={sIndex === sections.length - 1}
                        onSelect={() =>
                          void editor.moveSection(section.id, sIndex + 1)
                        }
                      >
                        <ArrowDownIcon />
                        {t("moveDown")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          setPending({ kind: "delete-section", section })
                        }
                      >
                        <Trash2Icon />
                        {t("deleteSection")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {section.steps.map((step, index) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      index={index}
                      section={section}
                      sections={sections}
                      active={step.id === selectedStepId}
                      onSelect={onSelect}
                      onMove={(sectionId, position) =>
                        void editor.moveStep(step.id, sectionId, position)
                      }
                      onDelete={() => setPending({ kind: "delete-step", step })}
                    />
                  ))}
                </ul>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-muted-foreground"
                    >
                      <PlusIcon data-icon="inline-start" />
                      {t("addStep")}
                      <ChevronDownIcon data-icon="inline-end" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem
                      onSelect={() => void addStep(section.id, "LESSON")}
                    >
                      <FileTextIcon />
                      {t("lesson")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void addStep(section.id, "QUIZ")}
                    >
                      <ListChecksIcon />
                      {t("quiz")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ol>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => void editor.addSection()}
        >
          <PlusIcon data-icon="inline-start" />
          {t("addSection")}
        </Button>
      </ScrollArea>

      <TextPromptDialog
        open={pending?.kind === "rename"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("renameSection")}
        label={t("sectionTitle")}
        initialValue={pending?.kind === "rename" ? pending.section.title : ""}
        submitLabel={t("save")}
        onSubmit={(title) =>
          pending?.kind === "rename"
            ? editor.renameSection(pending.section.id, title)
            : undefined
        }
      />

      <AlertDialog
        open={
          pending?.kind === "delete-section" || pending?.kind === "delete-step"
        }
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "delete-section"
                ? t("deleteSectionConfirm", {
                    title: pending.section.title,
                    stepCount: pending.section.steps.length,
                  })
                : pending?.kind === "delete-step"
                  ? t("deleteStepConfirm", { title: pending.step.title })
                  : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletedContent")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pending?.kind === "delete-section")
                  void editor.deleteSection(pending.section.id)
                if (pending?.kind === "delete-step")
                  void editor.deleteStep(pending.step.id)
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StepRow({
  step,
  index,
  section,
  sections,
  active,
  onSelect,
  onMove,
  onDelete,
}: {
  step: AuthorStep
  index: number
  section: AuthorSection
  sections: AuthorSection[]
  active: boolean
  onSelect: (stepId: string) => void
  onMove: (sectionId: string, position: number) => void
  onDelete: () => void
}) {
  const Icon = step.type === "QUIZ" ? ListChecksIcon : FileTextIcon
  const problem = stepProblem(step)
  const t = useTranslations("grow")
  const problemText = problem
    ? problem.key === "quizNeedsQuestion"
      ? t(problem.key)
      : t(problem.key, {
          bankSize: problem.bankSize,
          count: problem.count,
        })
    : null
  const others = sections.filter((s) => s.id !== section.id)

  return (
    <li
      className={cn(
        "group/row relative flex items-center rounded-md pr-1 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <button
        type="button"
        aria-current={active ? "step" : undefined}
        onClick={() => onSelect(step.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-8 pl-4 text-left outline-none focus-visible:underline"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="sr-only">
          {t("stepTypeLabel", {
            type: step.type === "QUIZ" ? t("quiz") : t("lesson"),
          })}
        </span>
        <span className="truncate">{step.title}</span>
        {!step.required && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("optional")}
          </span>
        )}
      </button>
      {problemText && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute right-8 text-warning"
              aria-label={problemText}
              role="img"
            >
              <TriangleAlertIcon className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{problemText}</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("actionsForStep", { title: step.title })}
            className="absolute right-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem
            disabled={index === 0}
            onSelect={() => onMove(section.id, index - 1)}
          >
            <ArrowUpIcon />
            {t("moveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === section.steps.length - 1}
            onSelect={() => onMove(section.id, index + 1)}
          >
            <ArrowDownIcon />
            {t("moveDown")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={others.length === 0}>
              <FolderInputIcon />
              {t("moveToSection")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {others.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onSelect={() => onMove(target.id, target.steps.length)}
                >
                  {target.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
