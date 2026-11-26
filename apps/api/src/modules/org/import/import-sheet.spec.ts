import * as ExcelJS from "exceljs";
import { readdirSync } from "fs";
import { tmpdir } from "os";
import { readSheet } from "./import-sheet";
import { ImportFileError, MAX_COLUMNS, MAX_ROWS } from "./import-types";

/** Builds a workbook in memory the way a person would save it from Excel. */
async function workbook(
  build: (wb: ExcelJS.Workbook) => void | Promise<void>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** About 13 MB uncompressed: distinct long strings, so the workbook does not shrink to a few bytes. */
async function bigWorkbook(): Promise<Buffer> {
  return workbook((wb) => {
    const ws = wb.addWorksheet("People");
    ws.addRow(["node_1"]);
    let seed = 1;
    for (let i = 0; i < 260; i++) {
      let text = "";
      while (text.length < 50_000) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        text += seed.toString(36);
      }
      ws.addRow([text.slice(0, 50_000)]);
    }
  });
}

/** Writes a declared size into the central-directory entries (all of them, or the one named). */
function withDeclaredSize(zip: Buffer, size: number, name?: string): Buffer {
  const out = Buffer.from(zip);
  const end = out.length - 22;
  const count = out.readUInt16LE(end + 10);
  let at = out.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    const nameLength = out.readUInt16LE(at + 28);
    if (!name || out.toString("utf8", at + 46, at + 46 + nameLength) === name)
      out.writeUInt32LE(size, at + 24);
    at +=
      46 + nameLength + out.readUInt16LE(at + 30) + out.readUInt16LE(at + 32);
  }
  return out;
}

const smallWorkbook = () =>
  workbook((wb) => {
    wb.addWorksheet("People").addRow(["node_1", "email"]);
  });

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

/** A ZIP with one stored entry, for a container that is a ZIP but not a workbook. */
function storedZip(name: string, data: Buffer): Buffer {
  const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const nameBytes = Buffer.from(name);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + data.length, 16);

  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}

describe("readSheet", () => {
  it("reads the first worksheet only", async () => {
    const buffer = await workbook((wb) => {
      wb.addWorksheet("People").addRow(["node_1", "email"]);
      wb.addWorksheet("Other").addRow(["unrelated"]);
    });
    await expect(readSheet(buffer)).resolves.toEqual({
      headers: ["node_1", "email"],
      rows: [],
    });
  });

  it("lower-cases and trims headers and ignores trailing empty header cells", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["  Node_1 ", "EMAIL", "", null]);
      ws.addRow(["Ventas", "ana@x.test"]);
    });
    const sheet = await readSheet(buffer);
    expect(sheet.headers).toEqual(["node_1", "email"]);
    expect(sheet.rows[0].cells).toMatchObject({
      node_1: "Ventas",
      email: "ana@x.test",
    });
  });

  it("gives a formula its cached result", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["first_name", "node_2"]);
      ws.getCell("B2").value = { formula: '"Ven"&"tas"', result: "Ventas" };
      ws.getCell("A2").value = { formula: "1+1", result: 2 };
      ws.getCell("A3").value = "Ana";
      ws.getCell("B3").value = { formula: "1+1" };
    });
    const { rows } = await readSheet(buffer);
    expect(rows[0].cells).toMatchObject({ first_name: 2, node_2: "Ventas" });
    expect(rows[1].cells).toMatchObject({ first_name: "Ana", node_2: null });
  });

  it("gives a hyperlink its text and rich text its plain text", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["first_name", "last_name", "email"]);
      ws.getCell("A2").value = {
        text: "Ana",
        hyperlink: "https://x.test/ana",
      };
      ws.getCell("B2").value = {
        richText: [{ text: "Gómez " }, { text: "Lopez", font: { bold: true } }],
      };
      ws.getCell("C2").value = { error: "#N/A" };
    });
    const { rows } = await readSheet(buffer);
    expect(rows[0].cells).toMatchObject({
      first_name: "Ana",
      last_name: "Gómez Lopez",
      email: null,
    });
  });

  it("reads a date cell as a Date, numbers and booleans as they are, strings trimmed and blanks as null", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow([
        "entry_date",
        "employee_code",
        "can_create_spaces",
        "first_name",
      ]);
      ws.addRow([new Date(Date.UTC(2024, 2, 5)), 1200, true, "   "]);
    });
    const { rows } = await readSheet(buffer);
    const cells = rows[0].cells;
    expect(cells.entry_date).toBeInstanceOf(Date);
    expect((cells.entry_date as Date).toISOString()).toBe(
      "2024-03-05T00:00:00.000Z",
    );
    expect(cells.employee_code).toBe(1200);
    expect(cells.can_create_spaces).toBe(true);
    expect(cells.first_name).toBeNull();
  });

  it("skips empty rows and keeps the spreadsheet's row numbers", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["node_1", "email"]);
      ws.addRow(["Ventas", "a@x.test"]);
      ws.addRow([]);
      ws.getCell("A4").value = "  ";
      ws.addRow(["Compras", "b@x.test"]);
    });
    const { rows } = await readSheet(buffer);
    expect(rows.map((r) => r.row)).toEqual([2, 5]);
    expect(rows[1].cells).toEqual({ node_1: "Compras", email: "b@x.test" });
  });

  it("reads the header row by its number: a blank first row means no headers", async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow([]);
      ws.getCell("A2").value = "node_1";
    });
    await expect(readSheet(buffer)).resolves.toEqual({ headers: [], rows: [] });
  });

  it("answers no headers for a workbook with no rows", async () => {
    const buffer = await workbook((wb) => {
      wb.addWorksheet("Empty");
    });
    await expect(readSheet(buffer)).resolves.toEqual({ headers: [], rows: [] });
  });

  it(`accepts ${MAX_ROWS} data rows`, async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["node_1"]);
      for (let i = 0; i < MAX_ROWS; i++) ws.addRow([`Area ${i}`]);
    });
    const { rows } = await readSheet(buffer);
    expect(rows).toHaveLength(MAX_ROWS);
  });

  it(`refuses more than ${MAX_ROWS} data rows`, async () => {
    const buffer = await workbook((wb) => {
      const ws = wb.addWorksheet("People");
      ws.addRow(["node_1"]);
      for (let i = 0; i <= MAX_ROWS; i++) ws.addRow([`Area ${i}`]);
    });
    const error = await failureOf(readSheet(buffer));
    expect(error).toBeInstanceOf(ImportFileError);
    expect(error).toMatchObject({
      code: "IMPORT_TOO_LARGE",
      params: { maxRows: MAX_ROWS, maxColumns: MAX_COLUMNS },
    });
  });

  it(`refuses more than ${MAX_COLUMNS} columns`, async () => {
    const headers = Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => `c${i}`);
    const buffer = await workbook((wb) => {
      wb.addWorksheet("People").addRow(headers);
    });
    await expect(readSheet(buffer)).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
  });

  it("accepts exactly the column limit", async () => {
    const headers = Array.from({ length: MAX_COLUMNS }, (_, i) => `c${i}`);
    const buffer = await workbook((wb) => {
      wb.addWorksheet("People").addRow(headers);
    });
    const sheet = await readSheet(buffer);
    expect(sheet.headers).toHaveLength(MAX_COLUMNS);
  });

  it("refuses bytes that are not a file a workbook can be read from", async () => {
    const random = Buffer.from(
      Array.from({ length: 4096 }, (_, i) => (i * 97 + 13) % 256),
    );
    await expect(readSheet(random)).rejects.toMatchObject({
      code: "IMPORT_UNREADABLE",
    });
  });

  it("refuses a ZIP that holds no workbook", async () => {
    const zip = storedZip("notes.txt", Buffer.from("not a workbook"));
    await expect(readSheet(zip)).rejects.toMatchObject({
      code: "IMPORT_UNREADABLE",
    });
  });

  it("refuses a workbook over 10 MB uncompressed, by the sizes its ZIP declares", async () => {
    await expect(readSheet(await bigWorkbook())).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
  }, 60_000);

  it("refuses a workbook whose declared sizes are too small for its contents", async () => {
    // Only the shared strings lie, so the first entries pass and the inflation itself hits the limit.
    const lying = withDeclaredSize(
      await bigWorkbook(),
      0,
      "xl/sharedStrings.xml",
    );
    await expect(readSheet(lying)).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
  }, 60_000);

  it("refuses a workbook whose declared sizes differ from its contents", async () => {
    const lying = withDeclaredSize(await smallWorkbook(), 1);
    await expect(readSheet(lying)).rejects.toMatchObject({
      code: "IMPORT_UNREADABLE",
    });
  });

  it("refuses a truncated workbook", async () => {
    const buffer = await smallWorkbook();
    await expect(
      readSheet(buffer.subarray(0, Math.floor(buffer.length / 2))),
    ).rejects.toMatchObject({ code: "IMPORT_UNREADABLE" });
  });

  it("refuses a ZIP64 archive", async () => {
    const zip = storedZip("xl/workbook.xml", Buffer.from("<workbook/>"));
    zip.writeUInt16LE(0xffff, zip.length - 22 + 10);
    await expect(readSheet(zip)).rejects.toMatchObject({
      code: "IMPORT_UNREADABLE",
    });
  });

  it("writes no temporary files", async () => {
    const buffer = await smallWorkbook();
    const before = new Set(readdirSync(tmpdir()));
    await readSheet(buffer);
    const added = readdirSync(tmpdir()).filter(
      (name) => !before.has(name) && name.startsWith("tmp-"),
    );
    expect(added).toEqual([]);
  });
});
