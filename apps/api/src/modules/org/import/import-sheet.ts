import * as ExcelJS from "exceljs";
import { inflateRawSync } from "zlib";
import {
  ImportFileError,
  MAX_COLUMNS,
  MAX_ROWS,
  type Cell,
  type Sheet,
  type SheetRow,
} from "./import-types";

/** Uncompressed size of the whole workbook: its declared sizes, and what its entries really inflate to. */
export const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;

const EMPTY: Sheet = { headers: [], rows: [] };
const END_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * Reads the first worksheet of an `.xlsx` into headers and rows. The ZIP is checked before exceljs
 * loads it in memory: its directory must be readable (ZIP64 is not), its declared sizes must fit
 * the limit, and every entry must inflate to exactly its declared size within the limit, since a
 * directory can lie. Anything that is not a workbook is `IMPORT_UNREADABLE`.
 */
export async function readSheet(buffer: Buffer): Promise<Sheet> {
  const entries = centralDirectory(buffer);
  const declared = entries.reduce((sum, entry) => sum + entry.declared, 0);
  if (declared > MAX_UNCOMPRESSED_BYTES) throw tooLarge();
  if (!entries.some((entry) => entry.name === "xl/workbook.xml"))
    throw unreadable();
  checkInflation(buffer, entries);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0],
    );
  } catch {
    throw unreadable();
  }
  const [first] = workbook.worksheets;
  return first ? readWorksheet(first) : EMPTY;
}

interface ZipEntry {
  name: string;
  method: number;
  compressed: number;
  declared: number;
  /** Offset of the entry's local header. */
  offset: number;
}

/** The entries of the central directory. ZIP64 and multi-disk archives are refused: Excel does not save them. */
function centralDirectory(zip: Buffer): ZipEntry[] {
  let end = -1;
  for (
    let at = zip.length - 22;
    at >= Math.max(0, zip.length - 22 - 0xffff) && end < 0;
    at--
  )
    if (zip.readUInt32LE(at) === END_SIG) end = at;
  if (end < 0) throw unreadable();

  const disk = zip.readUInt16LE(end + 4);
  const directoryDisk = zip.readUInt16LE(end + 6);
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  const offset = zip.readUInt32LE(end + 16);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    count === 0xffff ||
    size === 0xffffffff ||
    offset === 0xffffffff ||
    offset + size !== end
  )
    throw unreadable();

  const entries: ZipEntry[] = [];
  let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || zip.readUInt32LE(at) !== CENTRAL_SIG)
      throw unreadable();
    const nameLength = zip.readUInt16LE(at + 28);
    const next =
      at +
      46 +
      nameLength +
      zip.readUInt16LE(at + 30) +
      zip.readUInt16LE(at + 32);
    const compressed = zip.readUInt32LE(at + 20);
    const declared = zip.readUInt32LE(at + 24);
    const local = zip.readUInt32LE(at + 42);
    if (
      next > end ||
      compressed === 0xffffffff ||
      declared === 0xffffffff ||
      local === 0xffffffff
    )
      throw unreadable();
    entries.push({
      name: zip.toString("utf8", at + 46, at + 46 + nameLength),
      method: zip.readUInt16LE(at + 10),
      compressed,
      declared,
      offset: local,
    });
    at = next;
  }
  if (at !== end) throw unreadable();
  return entries;
}

/** Inflates every entry: stored or deflated, the size it really has must match its declaration and the limit. */
function checkInflation(zip: Buffer, entries: ZipEntry[]): void {
  let total = 0;
  for (const entry of entries) {
    const data = entryData(zip, entry);
    let bytes: Buffer;
    if (entry.method === 0) bytes = data;
    else if (entry.method === 8) {
      try {
        bytes = inflateRawSync(data, {
          maxOutputLength: MAX_UNCOMPRESSED_BYTES - total + 1,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE")
          throw tooLarge();
        throw unreadable();
      }
    } else throw unreadable();
    total += bytes.length;
    if (total > MAX_UNCOMPRESSED_BYTES) throw tooLarge();
    if (bytes.length !== entry.declared) throw unreadable();
  }
}

/** The stored bytes of an entry, after its local header. */
function entryData(zip: Buffer, entry: ZipEntry): Buffer {
  const at = entry.offset;
  if (at + 30 > zip.length || zip.readUInt32LE(at) !== LOCAL_SIG)
    throw unreadable();
  const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
  if (start + entry.compressed > zip.length) throw unreadable();
  return zip.subarray(start, start + entry.compressed);
}

function readWorksheet(worksheet: ExcelJS.Worksheet): Sheet {
  // An object, so the callback's writes are seen after it (TypeScript does not follow them into a let).
  const read: { headers?: string[]; headerless: boolean; rows: SheetRow[] } = {
    headerless: false,
    rows: [],
  };
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (read.headerless) return;
    const values = valuesByColumn(row);
    if (!read.headers) {
      // Row 1 is the header; a sheet that starts lower has none.
      if (row.number !== 1) {
        read.headerless = true;
        return;
      }
      read.headers = headerNames(values);
      if (read.headers.length > MAX_COLUMNS) throw tooLarge();
      if (read.headers.length === 0) read.headerless = true;
      return;
    }

    const headers = read.headers;
    const cells: Record<string, Cell> = {};
    headers.forEach((name, i) => {
      if (name) cells[name] = toCell(values.get(i + 1));
    });
    if (Object.values(cells).every((value) => value === null)) return;
    if (read.rows.length === MAX_ROWS) throw tooLarge();
    read.rows.push({ row: row.number, cells });
  });

  return read.headers && !read.headerless
    ? { headers: read.headers, rows: read.rows }
    : EMPTY;
}

function valuesByColumn(row: ExcelJS.Row): Map<number, unknown> {
  const values = new Map<number, unknown>();
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    values.set(column, cell.value);
  });
  return values;
}

/** Header names: the cells up to the last non-empty one, lower-cased and trimmed; blanks stay "". */
function headerNames(values: Map<number, unknown>): string[] {
  const names = new Map<number, string>();
  for (const [column, value] of values) {
    const name = String(toCell(value) ?? "").toLowerCase();
    if (name) names.set(column, name);
  }
  const last = Math.max(0, ...names.keys());
  return Array.from({ length: last }, (_, i) => names.get(i + 1) ?? "");
}

const unreadable = () => new ImportFileError("IMPORT_UNREADABLE");

const tooLarge = () =>
  new ImportFileError("IMPORT_TOO_LARGE", {
    maxRows: MAX_ROWS,
    maxColumns: MAX_COLUMNS,
  });

/**
 * The value of a cell as the import reads it: a formula its cached result, a hyperlink its text,
 * rich text its plain text, an error value nothing. Numbers and booleans stay as they are.
 */
function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "object") return null;
  const v = value as {
    formula?: unknown;
    result?: unknown;
    richText?: unknown;
    text?: unknown;
  };
  if ("formula" in v) return toCell(v.result);
  if (Array.isArray(v.richText))
    return toCell(
      (v.richText as { text?: unknown }[])
        .map((part) => String(part.text ?? ""))
        .join(""),
    );
  if ("text" in v) return toCell(v.text);
  return null;
}
