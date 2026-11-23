"use client"

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  FolderPlusIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import type { ImportReport } from "@/lib/admin-api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { TablePagination } from "@/components/shared/table-pagination"
import { useClientPage } from "@/hooks/use-client-page"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  issueRows,
  pathLabel,
  type IssueRow,
} from "@/components/settings/import/import-issues"

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      {/* mt-auto: a label that wraps does not push this number below its neighbours' */}
      <CardContent className="mt-auto">
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Severity({ severity }: { severity: IssueRow["severity"] }) {
  const t = useTranslations("settings.import.report")
  return severity === "error" ? (
    <StatusBadge tone="danger" icon={CircleAlertIcon}>
      {t("error")}
    </StatusBadge>
  ) : (
    <StatusBadge tone="warning" icon={AlertTriangleIcon}>
      {t("warning")}
    </StatusBadge>
  )
}

/** What a preview found: counts, areas to create, managers replaced, and every error and warning by row. */
export function ImportReportView({ report }: { report: ImportReport }) {
  const t = useTranslations("settings.import.report")
  const codes = useTranslations("settings.import.codes")
  const issues = issueRows(report)
  const paged = useClientPage(issues)

  // The API may add a code this build does not know yet: it falls back to a generic line.
  const message = ({ code, params }: IssueRow) => {
    const key = code as Parameters<typeof codes.has>[0]
    return codes.has(key) ? codes(key, params) : codes("UNKNOWN")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label={t("rows")} value={report.rows} />
        <Tile label={t("create")} value={report.create} />
        <Tile label={t("update")} value={report.update} />
        <Tile label={t("unchanged")} value={report.unchanged} />
        <Tile label={t("nodes")} value={report.nodesToCreate.length} />
      </div>

      {report.nodesToCreate.length > 0 && (
        <Section title={t("nodesTitle")}>
          <ul className="flex flex-col divide-y rounded-xl border">
            {report.nodesToCreate.map((path) => (
              <li
                key={pathLabel(path)}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <FolderPlusIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 break-words">{pathLabel(path)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.managersReplaced.length > 0 && (
        <Section title={t("managersTitle")}>
          <ul className="flex flex-col divide-y rounded-xl border">
            {report.managersReplaced.map((m) => (
              <li key={m.node} className="px-3 py-2 text-sm">
                {t("managerLine", m)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("issuesTitle")}>
        {issues.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2Icon />
              </EmptyMedia>
              <EmptyTitle>{t("noIssues")}</EmptyTitle>
              <EmptyDescription>{t("noIssuesBody")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("issuesCount", {
                errors: report.errors.length,
                warnings: report.warnings.length,
              })}
            </p>
            <div className="hidden overflow-hidden rounded-xl border lg:block">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-20">{t("row")}</TableHead>
                    <TableHead className="w-44">{t("column")}</TableHead>
                    <TableHead>{t("problem")}</TableHead>
                    <TableHead className="w-28">{t("severity")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((issue, i) => (
                    <TableRow key={i}>
                      <TableCell>{issue.row}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {issue.column}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {message(issue)}
                      </TableCell>
                      <TableCell>
                        <Severity severity={issue.severity} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col divide-y rounded-xl border lg:hidden">
              {paged.rows.map((issue, i) => (
                <li key={i} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {issue.column
                        ? t("rowColumn", {
                            row: issue.row,
                            column: issue.column,
                          })
                        : t("rowOnly", { row: issue.row })}
                    </span>
                    <Severity severity={issue.severity} />
                  </div>
                  <p>{message(issue)}</p>
                </li>
              ))}
            </ul>
            <TablePagination
              page={paged.page}
              pageSize={paged.pageSize}
              total={paged.total}
              onPageChange={paged.setPage}
              onPageSizeChange={paged.setPageSize}
            />
          </>
        )}
      </Section>
    </div>
  )
}
