type Cell = string | number | null | undefined;

// A spreadsheet runs a cell starting with these as a formula (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 BOM (so Excel reads accents) and formula-looking cells neutralised. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return (
    "﻿" +
    [header, ...rows].map((row) => row.map(cell).join(",") + "\r\n").join("")
  );
}
