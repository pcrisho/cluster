import { toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with a BOM, quotes what needs it and ends lines with CRLF", () => {
    const csv = toCsv(
      ["Name", "Note"],
      [
        ["Ana, Pérez", 'Said "hi"'],
        ["Line\nbreak", 12],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe(
      'Name,Note\r\n"Ana, Pérez","Said ""hi"""\r\n"Line\nbreak",12\r\n',
    );
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    const csv = toCsv(
      ["Cell"],
      [["=1+1"], ["+cmd"], ["-2"], ["@SUM(A1)"], ["\tx"], ["\rx"], ["ok"]],
    );
    expect(csv.slice(1).split("\r\n").slice(1, -1)).toEqual([
      "'=1+1",
      "'+cmd",
      "'-2",
      "'@SUM(A1)",
      "'\tx",
      '"\'\rx"',
      "ok",
    ]);
  });

  it("writes empty cells for null and undefined", () => {
    expect(toCsv(["A", "B"], [[null, undefined]]).slice(1)).toBe(
      "A,B\r\n,\r\n",
    );
  });
});
