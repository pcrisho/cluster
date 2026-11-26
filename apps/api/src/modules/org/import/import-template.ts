import * as ExcelJS from "exceljs"
import type { Locale } from "../../../common/locale"
import { translate, type MessageKey } from "../../../i18n/translate"
import { IMPORT_COLUMNS, NODE_COLUMNS } from "./import-types"

const NOTES = ["format", "preview", "roles", "keep", "flags"] as const

/** The catalog key that explains a column: node_2 … node_6 share one text. */
const columnKey = (column: string): MessageKey =>
  `importTemplate.columns.${(NODE_COLUMNS as readonly string[]).includes(column) && column !== "node_1" ? "areas" : column}` as MessageKey

/** The template: the fixed English header row on sheet one, instructions in the ADMIN's language on sheet two. */
export async function importTemplate(locale: Locale): Promise<Buffer> {
  const t = (key: MessageKey) => translate(locale, key)
  const wb = new ExcelJS.Workbook()
  const people = wb.addWorksheet(t("importTemplate.sheet"))
  people.addRow([...IMPORT_COLUMNS]).font = { bold: true }
  people.views = [{ state: "frozen", ySplit: 1 }]
  people.columns = IMPORT_COLUMNS.map(() => ({ width: 18 }))

  const help = wb.addWorksheet(t("importTemplate.instructionsSheet"))
  help.addRow([t("importTemplate.notes.title")]).font = { bold: true, size: 14 }
  for (const note of NOTES) help.addRow([t(`importTemplate.notes.${note}`)])
  help.addRow([])
  help.addRow([t("importTemplate.columnHeader"), t("importTemplate.ruleHeader")]).font = { bold: true }
  for (const column of IMPORT_COLUMNS) help.addRow([column, t(columnKey(column))])
  help.getColumn(1).width = 22
  help.getColumn(2).width = 110
  return Buffer.from(await wb.xlsx.writeBuffer())
}
