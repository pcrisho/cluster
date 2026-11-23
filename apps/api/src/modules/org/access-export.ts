import * as ExcelJS from "exceljs";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The names from the main node down to a person's node, as the people see them. */
export const joinNodePath = (names: string[]): string => names.join(" / ");

/** When the credentials stop working, as the people who read the sheet tell time: their organization's zone, named. */
export const formatExpiry = (
  date: Date,
  locale: string,
  timeZone: string,
): string =>
  `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date)} (${timeZone})`;

/**
 * The credentials workbook (docs/specs/auth/access-without-mail): a notice row, the header, then one row per
 * person. Every cell is written as text, so a value that starts with "=" is never a formula.
 */
export async function accessWorkbook(input: {
  notice: string;
  sheet?: string;
  headers: string[];
  rows: string[][];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(input.sheet ?? "Access");
  ws.addRow([input.notice]);
  ws.addRow(input.headers);
  for (const row of input.rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
