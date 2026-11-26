"use client"

import {
  ChevronDownIcon,
  ListFilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"

import type {
  ComplianceReport,
  ReportFilters as Filters,
  ReportState,
} from "@/lib/grow-api"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { type FilterOption, ReportMultiFilter } from "./report-multi-filter"
import { reportStatusLabel } from "./report-status"

export const REPORT_STATES: ReportState[] = [
  "COMPLETED",
  "IN_PROGRESS",
  "OVERDUE",
  "NOT_STARTED",
]

const ALL = "_all"
const CHIP =
  "inline-flex max-w-full items-center gap-0.5 rounded-full border py-0.5 pr-0.5 pl-1 text-xs"
const CHIP_BUTTON =
  "min-w-0 truncate rounded-full px-2 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
const CHIP_REMOVE =
  "shrink-0 rounded-full p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

type ValueKey = "courseId" | "orgNodeId" | "positionId" | "status"

type Props = {
  filters: Filters
  options: ComplianceReport["filters"]
  summary: Record<ReportState, number>
  total: number
  search: string
  onSearch: (value: string) => void
  onChange: (patch: Partial<Filters>) => void
  onClear: () => void
  /** Shown at the end of the first row (Export CSV). */
  action?: ReactNode
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value?: string
  options: { id: string; name: string }[]
  onChange: (value?: string) => void
}) {
  const t = useTranslations("grow.reportFilters")
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALL}>{t("all")}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export function ReportFilters({
  filters,
  options,
  summary,
  total,
  search,
  onSearch,
  onChange,
  onClear,
  action,
}: Props) {
  const t = useTranslations("grow.reportFilters")
  const tStatus = useTranslations("grow.learnerStatus")
  const tMsg = useTranslations("grow.reportMessages")
  const [openChip, setOpenChip] = useState<ValueKey | null>(null)

  const categories: {
    key: ValueKey
    label: string
    options: FilterOption[]
  }[] = [
    {
      key: "status",
      label: t("status"),
      options: REPORT_STATES.map((state) => ({
        value: state,
        label: tStatus(reportStatusLabel(state)),
        hint: String(summary[state]),
      })),
    },
    {
      key: "courseId",
      label: t("course"),
      options: options.courses.map((course) => ({
        value: course.id,
        label: course.archived
          ? t("archivedCourse", { course: course.name })
          : course.name,
      })),
    },
    {
      key: "orgNodeId",
      label: t("area"),
      options: options.areas.map((area) => ({
        value: area.id,
        label: area.name,
        hint: area.main ? t("mainNode") : undefined,
      })),
    },
    {
      key: "positionId",
      label: t("position"),
      options: options.positions.map((position) => ({
        value: position.id,
        label: position.name,
      })),
    },
  ]

  const selectedOf = (key: ValueKey): string[] => filters[key] ?? []
  const setValues = (key: ValueKey, values: string[]) =>
    onChange({
      [key]: values.length ? values : undefined,
    } as Partial<Filters>)
  const valuesLabel = (category: (typeof categories)[number]) =>
    selectedOf(category.key)
      .map(
        (value) =>
          category.options.find((option) => option.value === value)?.label ??
          value
      )
      .join(", ")

  const active = categories.filter(
    (category) => selectedOf(category.key).length > 0
  )
  const activeCount = active.length + (filters.scope === "all" ? 1 : 0)
  const hasFilters = activeCount > 0 || !!search

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            id="report-search"
            aria-label={t("search")}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t("nameOrEmail")}
          />
        </InputGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <ListFilterIcon data-icon="inline-start" />
              {t("filters")}
              {activeCount > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 p-4"
          >
            {categories.map((category) => (
              <div key={category.key} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{category.label}</span>
                <ReportMultiFilter
                  label={category.label}
                  options={category.options}
                  selected={selectedOf(category.key)}
                  onChange={(values) => setValues(category.key, values)}
                  trigger={
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedOf(category.key).length
                          ? valuesLabel(category)
                          : t("all")}
                      </span>
                      <ChevronDownIcon className="text-muted-foreground" />
                    </Button>
                  }
                />
              </div>
            ))}
            <ScopeSwitch
              checked={filters.scope === "all"}
              onChange={(checked) =>
                onChange({ scope: checked ? "all" : undefined })
              }
            />
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button variant="ghost" onClick={onClear}>
            {tMsg("clearFilters")}
          </Button>
        )}
        <div className="ml-auto">{action}</div>
      </div>
      {(active.length > 0 || filters.scope === "all") && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((category) => (
            <span key={category.key} className={CHIP}>
              <ReportMultiFilter
                label={category.label}
                options={category.options}
                selected={selectedOf(category.key)}
                onChange={(values) => setValues(category.key, values)}
                open={openChip === category.key}
                onOpenChange={(open) => setOpenChip(open ? category.key : null)}
                trigger={
                  <button
                    type="button"
                    className={CHIP_BUTTON}
                    aria-label={t("editFilter", { filter: category.label })}
                  >
                    <span className="text-muted-foreground">
                      {category.label}:{" "}
                    </span>
                    {valuesLabel(category)}
                  </button>
                }
              />
              <button
                type="button"
                aria-label={t("removeFilter", { filter: category.label })}
                onClick={() => setValues(category.key, [])}
                className={CHIP_REMOVE}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          {filters.scope === "all" && (
            <span className={CHIP}>
              <span className="px-2 py-0.5">
                {t("includeArchivedVoluntary")}
              </span>
              <button
                type="button"
                aria-label={t("removeFilter", {
                  filter: t("includeArchivedVoluntary"),
                })}
                onClick={() => onChange({ scope: undefined })}
                className={CHIP_REMOVE}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          )}
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {tMsg("assignedCount", { count: total })}
          </span>
        </div>
      )}
    </div>
  )
}

export function ScopeSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const t = useTranslations("grow.reportFilters")
  return (
    <Field orientation="horizontal" className="w-fit">
      <Switch id="report-scope" checked={checked} onCheckedChange={onChange} />
      <FieldLabel htmlFor="report-scope" className="font-normal">
        {t("includeArchivedVoluntary")}
      </FieldLabel>
    </Field>
  )
}
