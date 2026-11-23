import type { ImportIssue, ImportReport } from "@/lib/admin-api"

export type Severity = "error" | "warning"
export type IssueRow = ImportIssue & { severity: Severity }

/** Errors first, then warnings; inside each, by spreadsheet row (stable, so the file's column order within a row is kept). */
export function issueRows(report: ImportReport): IssueRow[] {
  const mark = (list: ImportIssue[], severity: Severity): IssueRow[] =>
    list.map((issue) => ({ ...issue, severity })).sort((a, b) => a.row - b.row)
  return [...mark(report.errors, "error"), ...mark(report.warnings, "warning")]
}

/** "A › B › C" */
export function pathLabel(path: string[]): string {
  return path.join(" › ")
}
