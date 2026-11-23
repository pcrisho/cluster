import { issueRows, pathLabel } from "./import-issues"
import type { ImportReport } from "@/lib/admin-api"

const report = (over: Partial<ImportReport>): ImportReport => ({
  rows: 0,
  create: 0,
  update: 0,
  unchanged: 0,
  nodesToCreate: [],
  managersReplaced: [],
  errors: [],
  warnings: [],
  ...over,
})

describe("issueRows", () => {
  it("lists errors before warnings, each by row, keeping the order inside a row", () => {
    const rows = issueRows(
      report({
        errors: [
          { row: 5, code: "REQUIRED", column: "email" },
          { row: 2, code: "INVALID_DATE", column: "entry_date" },
          { row: 2, code: "REQUIRED", column: "first_name" },
        ],
        warnings: [{ row: 1, code: "NO_CHANGES" }],
      })
    )
    expect(rows.map((r) => [r.severity, r.row, r.code])).toEqual([
      ["error", 2, "INVALID_DATE"],
      ["error", 2, "REQUIRED"],
      ["error", 5, "REQUIRED"],
      ["warning", 1, "NO_CHANGES"],
    ])
  })

  it("is empty for a clean report", () => {
    expect(issueRows(report({}))).toEqual([])
  })
})

describe("pathLabel", () => {
  it("joins the levels", () => {
    expect(pathLabel(["Acme", "Lima", "Sales"])).toBe("Acme › Lima › Sales")
  })
})
