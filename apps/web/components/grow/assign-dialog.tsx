"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { HelpCircleIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api"
import { growApi, type Assignment, type AssignmentRules } from "@/lib/grow-api"
import { useDates } from "@/lib/i18n/use-dates"
import type { Principal } from "@/lib/org-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PRINCIPAL_ICON,
  PrincipalPicker,
} from "@/components/shared/principal-picker"

/** "2026-11-30" as a local date (no timezone shift). */
const localDate = (date: string) => new Date(`${date}T12:00:00`)

interface AssignDialogProps {
  course: { id: string; title: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Who a course is assigned to: people, areas and positions, mandatory or not, with a due date. Changes apply at once. */
export function AssignDialog({
  course,
  open,
  onOpenChange,
}: AssignDialogProps) {
  const t = useTranslations("grow.assignments")
  const dates = useDates()
  const [entries, setEntries] = useState<Assignment[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const dueRule = (
    assignment: Pick<Assignment, "dueAt" | "dueInDays" | "principal">
  ) => {
    if (!assignment.dueAt || !assignment.dueInDays) return null
    const after =
      assignment.principal.type === "USER"
        ? t("afterAssigned")
        : t("afterJoining")
    const date = t("byDate", { date: dates.calendar(assignment.dueAt) })
    const days = t("daysAfter", { count: assignment.dueInDays, after })
    return t("dateOrRelative", { date, days })
  }

  const detail = (principal: Principal) =>
    principal.type === "USER"
      ? principal.detail
      : principal.type === "ORG_NODE"
        ? principal.main
          ? t("mainNodeWithAreas")
          : t("areaWithSubareas")
        : principal.detail
          ? t("positionIn", { name: principal.detail })
          : t("position")

  const load = useCallback(async () => {
    try {
      setEntries(await growApi.listAssignments(course.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [course.id])

  useEffect(() => {
    if (open) Promise.resolve().then(load)
  }, [open, load])

  useEffect(() => {
    if (adding) pickerRef.current?.scrollIntoView({ block: "nearest" })
  }, [adding])

  const run = async (rowId: string, action: () => Promise<void>) => {
    setBusy(rowId)
    try {
      await action()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const replace = (next: Assignment) =>
    setEntries((list) => list && list.map((e) => (e.id === next.id ? next : e)))

  const update = (entry: Assignment, rules: AssignmentRules) =>
    run(entry.id, async () =>
      replace(await growApi.updateAssignment(entry.id, rules))
    )

  const add = (p: Principal) =>
    run("new", async () => {
      const created = await growApi.addAssignment(course.id, {
        principalType: p.type,
        principalId: p.id,
      })
      setEntries((list) => [
        ...(list ?? []).filter((e) => e.id !== created.id),
        created,
      ])
      setAdding(false)
    })

  const remove = (entry: Assignment) =>
    run(entry.id, async () => {
      await growApi.removeAssignment(entry.id)
      setEntries((list) => list && list.filter((e) => e.id !== entry.id))
    })

  const taken = new Set(
    (entries ?? []).map((e) => `${e.principal.type}:${e.principal.id}`)
  )
  const hasGroupAssignments = (entries ?? []).some(
    (entry) => entry.principal.type !== "USER"
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-[min(24rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
          <div className="flex items-center gap-1">
            <DialogTitle>{t("title", { course: course.title })}</DialogTitle>
            {hasGroupAssignments && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("futureMembersHelp")}
                  >
                    <HelpCircleIcon aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80">
                  <PopoverDescription>{t("futureMembers")}</PopoverDescription>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6">
          {entries === null ? (
            <div className="flex flex-col gap-2 py-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-4 sm:py-6">
              {entries.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  {t("empty")}
                </p>
              )}
              {entries.length > 0 && (
                <Table className="table-fixed">
                  <TableHeader className="hidden md:table-header-group">
                    <TableRow>
                      <TableHead className="w-[36%] px-2">
                        {t("assignedTo")}
                      </TableHead>
                      <TableHead className="w-[14%] px-2">
                        {t("reached")}
                      </TableHead>
                      <TableHead className="w-[12%] px-2">
                        {t("mandatory")}
                      </TableHead>
                      <TableHead className="w-[34%] px-2">
                        {t("deadline")}
                      </TableHead>
                      <TableHead className="w-10 px-1">
                        <span className="sr-only">{t("removeAssignment")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="block md:table-row-group">
                    {entries.map((entry) => {
                      const Icon = PRINCIPAL_ICON[entry.principal.type]
                      const rowBusy = busy === entry.id
                      const combinedDueRule = dueRule(entry)

                      return (
                        <TableRow
                          key={entry.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 border-b py-4 last:border-b-0 md:table-row md:border-b-0 md:py-0"
                        >
                          <TableCell className="col-span-2 min-w-0 p-0 whitespace-normal md:table-cell md:px-2 md:py-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                <Icon
                                  className="size-4 text-muted-foreground"
                                  aria-hidden
                                />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-medium">
                                    {entry.principal.name}
                                  </span>
                                  {entry.archived && (
                                    <Badge variant="outline">
                                      {t("archived")}
                                    </Badge>
                                  )}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {detail(entry.principal)}
                                </div>
                                <span className="text-xs text-muted-foreground md:hidden">
                                  {t("reached")}:{" "}
                                  {t("reachedCount", {
                                    count: entry.reachedCount,
                                  })}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden p-0 text-xs whitespace-normal text-muted-foreground md:table-cell md:px-2 md:py-3">
                            {t("reachedCount", {
                              count: entry.reachedCount,
                            })}
                          </TableCell>
                          <TableCell className="col-start-1 row-start-2 flex items-center gap-2 p-0 whitespace-normal md:col-auto md:row-auto md:table-cell md:px-2 md:py-3">
                            <Switch
                              id={`mandatory-${entry.id}`}
                              checked={entry.mandatory}
                              disabled={rowBusy}
                              aria-label={t("mandatoryFor", {
                                name: entry.principal.name,
                              })}
                              onCheckedChange={(mandatory) =>
                                void update(entry, { mandatory })
                              }
                            />
                          </TableCell>
                          <TableCell className="col-span-2 row-start-3 min-w-0 p-0 whitespace-normal md:col-auto md:row-auto md:table-cell md:px-2 md:py-3">
                            {entry.mandatory ? (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium md:hidden">
                                  {t("deadline")}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <DatePicker
                                    value={
                                      entry.dueAt
                                        ? localDate(entry.dueAt).toISOString()
                                        : ""
                                    }
                                    placeholder={t("dueDate")}
                                    onChange={(iso) =>
                                      void update(entry, {
                                        dueAt: iso
                                          ? format(new Date(iso), "yyyy-MM-dd")
                                          : null,
                                      })
                                    }
                                  />
                                  {entry.dueAt && (
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label={t("clearDueDate")}
                                      onClick={() =>
                                        void update(entry, { dueAt: null })
                                      }
                                    >
                                      <XIcon />
                                    </Button>
                                  )}
                                  <DaysInput
                                    entry={entry}
                                    disabled={rowBusy}
                                    onSave={(dueInDays) =>
                                      void update(entry, { dueInDays })
                                    }
                                  />
                                </div>
                                {combinedDueRule && (
                                  <p className="text-xs text-muted-foreground">
                                    {combinedDueRule}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground md:hidden">
                                {t("notRequired")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="col-start-2 row-start-2 flex items-center justify-end p-0 md:col-auto md:row-auto md:table-cell md:px-1 md:py-3 md:text-right">
                            {rowBusy ? (
                              <Spinner
                                className="text-muted-foreground"
                                aria-label={t("saving")}
                              />
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={t("remove", {
                                  name: entry.principal.name,
                                })}
                                onClick={() => void remove(entry)}
                              >
                                <Trash2Icon aria-hidden />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              {adding && (
                <div ref={pickerRef}>
                  <PrincipalPicker
                    taken={taken}
                    takenLabel={t("assigned")}
                    onPick={(p) => void add(p)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={entries === null || busy === "new"}
            onClick={() => setAdding((value) => !value)}
          >
            {adding ? (
              <XIcon data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            {adding ? t("cancelAdding") : t("addPrincipals")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DaysInput({
  entry,
  disabled,
  onSave,
}: {
  entry: Assignment
  disabled: boolean
  onSave: (days: number | null) => void
}) {
  const t = useTranslations("grow.assignments")
  const [value, setValue] = useState(entry.dueInDays?.toString() ?? "")
  const id = `days-${entry.id}`
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {t("within")}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={365}
        placeholder={t("noNumber")}
        className="h-8 w-16 text-xs"
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const days = value.trim() === "" ? null : Number(value)
          if (
            days !== null &&
            (!Number.isInteger(days) || days < 1 || days > 365)
          ) {
            return setValue(entry.dueInDays?.toString() ?? "")
          }
          if (days !== entry.dueInDays) onSave(days)
        }}
      />
      <span className="text-xs text-muted-foreground">{t("days")}</span>
    </div>
  )
}
