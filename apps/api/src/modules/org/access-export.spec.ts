import * as ExcelJS from "exceljs";
import { accessWorkbook, formatExpiry, joinNodePath } from "./access-export";

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs declares its own Buffer type; the bytes are the same.
  await wb.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  return wb.worksheets[0];
}

describe("access export workbook", () => {
  it("writes a notice row, the header, then one row per person", async () => {
    const buffer = await accessWorkbook({
      notice: "Keep this file safe",
      headers: ["Name", "Credential"],
      rows: [["Ana", "https://x.test/set-password?token=abc"]],
    });
    const sheet = await read(buffer);
    expect(sheet.getRow(1).getCell(1).value).toBe("Keep this file safe");
    expect(sheet.getRow(2).getCell(1).value).toBe("Name");
    expect(sheet.getRow(3).getCell(1).value).toBe("Ana");
    expect(sheet.getRow(3).getCell(2).value).toBe(
      "https://x.test/set-password?token=abc",
    );
  });

  it("writes every value as text: a value starting with = is never a formula", async () => {
    const buffer = await accessWorkbook({
      notice: "n",
      headers: ["a", "b", "c"],
      rows: [['=HYPERLINK("https://evil.test")', "+1", "@cmd"]],
    });
    const sheet = await read(buffer);
    for (let col = 1; col <= 3; col++) {
      const cell = sheet.getRow(3).getCell(col);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
    }
    expect(sheet.getRow(3).getCell(1).value).toBe(
      '=HYPERLINK("https://evil.test")',
    );
  });
});

describe("node path", () => {
  it("joins the names from the main node down", () => {
    expect(joinNodePath(["Empresa", "Operaciones", "Turno A"])).toBe(
      "Empresa / Operaciones / Turno A",
    );
    expect(joinNodePath(["Empresa"])).toBe("Empresa");
  });

  it("writes the expiry in the organization's zone and names it", () => {
    const at = new Date("2026-11-13T17:30:00Z");
    expect(formatExpiry(at, "en", "America/Lima")).toBe(
      "Nov 13, 2026, 12:30 PM (America/Lima)",
    );
    expect(formatExpiry(at, "es", "UTC")).toMatch(
      /^13 nov 2026, 17:30 \(UTC\)$/,
    );
  });
});
