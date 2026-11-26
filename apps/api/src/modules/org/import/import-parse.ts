import { isEmail } from "class-validator";
import { normalizeCode } from "../dto/create-org-node.dto";
import { normalizeName } from "./import-names";
import {
  IMPORT_COLUMNS,
  ImportFileError,
  NODE_COLUMNS,
  REQUIRED_HEADERS,
  type Cell,
  type ImportColumn,
  type ImportIssue,
  type ParsedRow,
  type ParseResult,
  type Sheet,
} from "./import-types";

const NAME_MAX = 100;
const EMPLOYEE_CODE_MAX = 50;
const NODE_CODE = /^[A-Z0-9._/-]{1,40}$/;
/** Yes/no words once normalizeName has dropped accents and case. */
const FLAG_WORDS = new Map<string, boolean>([
  ["yes", true],
  ["si", true],
  ["true", true],
  ["1", true],
  ["no", false],
  ["false", false],
  ["0", false],
]);

/**
 * Header check and typed rows of a read sheet (docs/specs/org/bulk-import, rule 3 and the column table).
 * Pure: nothing is looked up in the database. Every problem of a row is an issue; the file-level
 * header problem throws `IMPORT_HEADERS`.
 */
export function parseSheet(sheet: Sheet): ParseResult {
  checkHeaders(sheet.headers);
  const errors: ImportIssue[] = [];
  const rows: ParsedRow[] = [];
  const firstRowOfEmail = new Map<string, number>();

  for (const { row, cells } of sheet.rows) {
    const issue = (
      column: ImportColumn,
      code: string,
      params?: Record<string, number>,
    ) =>
      errors.push(
        params ? { row, column, code, params } : { row, column, code },
      );
    const cell = (column: ImportColumn): Cell => cells[column] ?? null;
    const bounded = (column: ImportColumn, max: number): string | null => {
      const value = textOf(cell(column));
      if (value !== null && value.length > max)
        issue(column, "TOO_LONG", { max });
      return value;
    };
    const flag = (column: ImportColumn): boolean | null => {
      const value = flagOf(cell(column));
      if (value === undefined) issue(column, "INVALID_BOOLEAN");
      return value ?? null;
    };

    const nodes = NODE_COLUMNS.map((column) => bounded(column, NAME_MAX) ?? "");
    const code = normalizeCode({ value: textOf(cell("node_1_code")) }) as
      | string
      | null;
    const nodeCode = code !== null && NODE_CODE.test(code) ? code : null;
    if (code !== null && nodeCode === null)
      issue("node_1_code", "NODE_CODE_INVALID");
    const firstName = bounded("first_name", NAME_MAX);
    const lastName = bounded("last_name", NAME_MAX);

    let email: string | null = null;
    const address = textOf(cell("email"))?.toLowerCase() ?? null;
    if (address === null) issue("email", "REQUIRED");
    else if (!isEmail(address)) issue("email", "INVALID_EMAIL");
    else {
      email = address;
      const firstRow = firstRowOfEmail.get(address);
      if (firstRow === undefined) firstRowOfEmail.set(address, row);
      else issue("email", "DUPLICATE_EMAIL", { firstRow });
    }

    const employeeCode = bounded("employee_code", EMPLOYEE_CODE_MAX);
    const position = bounded("position", NAME_MAX);
    const isNodeManager = flag("is_node_manager");
    const entryDate = dateOf(cell("entry_date"));
    if (entryDate === undefined) issue("entry_date", "INVALID_DATE");
    const canCreateSpaces = flag("can_create_spaces");
    const canDeleteSpaces = flag("can_delete_spaces");

    rows.push({
      row,
      nodes,
      nodeCode,
      firstName,
      lastName,
      email,
      employeeCode,
      position,
      isNodeManager,
      entryDate: entryDate ?? null,
      canCreateSpaces,
      canDeleteSpaces,
    });
  }

  return { rows, errors };
}

/**
 * Blank header cells are not columns (the reader drops them too). Unknown, repeated and missing
 * names fail the file: a repeated name would make one of its columns silently win.
 */
function checkHeaders(headers: string[]): void {
  const known = new Set<string>(IMPORT_COLUMNS);
  const named = headers.filter((h) => h !== "");
  const unknown = [...new Set(named.filter((h) => !known.has(h)))];
  const duplicate = [
    ...new Set(named.filter((h, i) => named.indexOf(h) !== i)),
  ];
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (unknown.length > 0 || missing.length > 0 || duplicate.length > 0)
    throw new ImportFileError("IMPORT_HEADERS", {
      missing: missing.join(", "),
      unknown: unknown.join(", "),
      duplicate: duplicate.join(", "),
    });
}

/** Text of a cell, trimmed; `null` when empty. Numbers are written without `.0`. */
function textOf(cell: Cell): string | null {
  if (cell === null) return null;
  const text =
    cell instanceof Date
      ? cell.toISOString().slice(0, 10)
      : String(cell).trim();
  return text === "" ? null : text;
}

/** `true`/`false`, `null` for an empty cell, `undefined` for a value that is not a yes or a no. */
function flagOf(cell: Cell): boolean | null | undefined {
  if (cell === null) return null;
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number")
    return cell === 1 ? true : cell === 0 ? false : undefined;
  if (cell instanceof Date) return undefined;
  const word = normalizeName(cell);
  return word === "" ? null : FLAG_WORDS.get(word);
}

/** `YYYY-MM-DD` of a date cell (its UTC day) or of a real date written as text; `undefined` when invalid. */
function dateOf(cell: Cell): string | null | undefined {
  if (cell === null) return null;
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime())
      ? undefined
      : cell.toISOString().slice(0, 10);
  if (typeof cell !== "string") return undefined;
  const text = cell.trim();
  if (text === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real ? text : undefined;
}
