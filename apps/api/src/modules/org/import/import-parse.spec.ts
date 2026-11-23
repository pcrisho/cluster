import {
  IMPORT_COLUMNS,
  ImportFileError,
  type Cell,
  type ImportColumn,
  type Sheet,
} from "./import-types";
import { parseSheet } from "./import-parse";

const sheetOf = (
  rows: Record<string, Cell>[],
  headers: readonly string[] = IMPORT_COLUMNS,
): Sheet => ({
  headers: [...headers],
  rows: rows.map((cells, i) => ({ row: i + 2, cells })),
});

const valid = {
  node_1: "Ventas",
  first_name: "Ana",
  last_name: "Gómez",
  email: "ana@x.test",
};

/** Parses one row and returns it with its issues. */
function one(cells: Record<string, Cell>) {
  const { rows, errors } = parseSheet(sheetOf([{ ...valid, ...cells }]));
  return { row: rows[0], errors };
}

const codesOf = (errors: { code: string; column?: ImportColumn }[]) =>
  errors.map((e) => `${e.column}:${e.code}`);

describe("parseSheet headers", () => {
  it("accepts the template headers, in any order", () => {
    const headers = [...IMPORT_COLUMNS].reverse();
    expect(() => parseSheet(sheetOf([valid], headers))).not.toThrow();
  });

  it("ignores blank header cells", () => {
    expect(() =>
      parseSheet(sheetOf([valid], [...IMPORT_COLUMNS, "", ""])),
    ).not.toThrow();
  });

  it("refuses unknown headers and lists them", () => {
    const headers = ["node_1", "first_name", "last_name", "email", "salary"];
    expect(() => parseSheet(sheetOf([], headers))).toThrow(ImportFileError);
    try {
      parseSheet(sheetOf([], headers));
    } catch (error) {
      expect(error).toMatchObject({
        code: "IMPORT_HEADERS",
        params: { missing: "", unknown: "salary" },
      });
    }
  });

  it("refuses missing required headers and lists them", () => {
    const headers = ["node_1", "first_name", "email"];
    try {
      parseSheet(sheetOf([], headers));
      throw new Error("expected IMPORT_HEADERS");
    } catch (error) {
      expect(error).toMatchObject({
        code: "IMPORT_HEADERS",
        params: { missing: "last_name", unknown: "" },
      });
    }
  });

  it("lists missing and unknown together", () => {
    try {
      parseSheet(sheetOf([], ["node_1", "salary", "first_name"]));
      throw new Error("expected IMPORT_HEADERS");
    } catch (error) {
      expect(error).toMatchObject({
        code: "IMPORT_HEADERS",
        params: { missing: "last_name, email", unknown: "salary" },
      });
    }
  });

  it("refuses a header that appears twice and lists each repeated name once", () => {
    const headers = [
      "node_1",
      "first_name",
      "last_name",
      "email",
      "email",
      "node_2",
      "node_2",
      "node_2",
    ];
    try {
      parseSheet(sheetOf([], headers));
      throw new Error("expected IMPORT_HEADERS");
    } catch (error) {
      expect(error).toMatchObject({
        code: "IMPORT_HEADERS",
        params: { missing: "", unknown: "", duplicate: "email, node_2" },
      });
    }
  });

  it("gives an empty duplicate list when no header repeats", () => {
    try {
      parseSheet(sheetOf([], ["node_1", "first_name", "last_name", "salary"]));
      throw new Error("expected IMPORT_HEADERS");
    } catch (error) {
      expect(error).toMatchObject({ params: { duplicate: "" } });
    }
  });

  it("does not require node_2 to node_6 or the optional columns", () => {
    expect(() =>
      parseSheet(
        sheetOf([valid], ["node_1", "first_name", "last_name", "email"]),
      ),
    ).not.toThrow();
  });
});

describe("parseSheet rows", () => {
  it("maps every column to its typed field and keeps the row number", () => {
    const { rows, errors } = parseSheet(
      sheetOf([
        {
          node_1: " Ventas ",
          node_1_code: " ventas-01 ",
          node_2: "Lima",
          first_name: " Ana ",
          last_name: "Gómez",
          email: " Ana.Gomez@X.test ",
          employee_code: " 1200 ",
          position: "Analista",
          is_node_manager: "yes",
          entry_date: "2024-03-05",
          can_create_spaces: "no",
          can_delete_spaces: "",
        },
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      row: 2,
      nodes: ["Ventas", "Lima", "", "", "", ""],
      nodeCode: "VENTAS-01",
      firstName: "Ana",
      lastName: "Gómez",
      email: "ana.gomez@x.test",
      employeeCode: "1200",
      position: "Analista",
      isNodeManager: true,
      entryDate: "2024-03-05",
      canCreateSpaces: false,
      canDeleteSpaces: null,
    });
  });

  it("turns empty and blank text cells into null, and empty node cells into an empty string", () => {
    const { row } = one({
      first_name: "   ",
      position: "",
      employee_code: null,
    });
    expect(row).toMatchObject({
      firstName: null,
      position: null,
      employeeCode: null,
      nodes: ["Ventas", "", "", "", "", ""],
    });
  });

  it("writes numbers in text columns as text, integers without .0", () => {
    const { row } = one({
      employee_code: 1200,
      position: 7,
      node_1: 3,
      node_2: 2.5,
      first_name: 42,
    });
    expect(row).toMatchObject({
      employeeCode: "1200",
      position: "7",
      nodes: ["3", "2.5", "", "", "", ""],
      firstName: "42",
    });
  });

  it("does not require first and last names (the planner decides)", () => {
    const { errors } = one({ first_name: null, last_name: "" });
    expect(errors).toEqual([]);
  });

  it("keeps the rows in order and returns every issue", () => {
    const { rows, errors } = parseSheet(
      sheetOf([
        { ...valid, email: "bad" },
        { ...valid, email: "" },
        { ...valid, email: "ok@x.test", is_node_manager: "maybe" },
      ]),
    );
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
  });
});

describe("email", () => {
  it("is lower-cased and kept when valid", () => {
    expect(one({ email: "ANA@X.TEST" }).row.email).toBe("ana@x.test");
  });

  it("is REQUIRED when empty", () => {
    const { row, errors } = one({ email: "   " });
    expect(row.email).toBeNull();
    expect(errors).toEqual([{ row: 2, column: "email", code: "REQUIRED" }]);
  });

  it("is INVALID_EMAIL when malformed, and null", () => {
    for (const bad of ["ana@", "ana.x.test", "ana@x"]) {
      const { row, errors } = one({ email: bad });
      expect(row.email).toBeNull();
      expect(errors).toEqual([
        { row: 2, column: "email", code: "INVALID_EMAIL" },
      ]);
    }
  });

  it("is DUPLICATE_EMAIL on every later row, naming the first, ignoring case", () => {
    const { errors } = parseSheet(
      sheetOf([
        { ...valid, email: "ana@x.test" },
        { ...valid, email: "bob@x.test" },
        { ...valid, email: "ANA@x.test" },
        { ...valid, email: "ana@x.test" },
      ]),
    );
    expect(errors).toEqual([
      {
        row: 4,
        column: "email",
        code: "DUPLICATE_EMAIL",
        params: { firstRow: 2 },
      },
      {
        row: 5,
        column: "email",
        code: "DUPLICATE_EMAIL",
        params: { firstRow: 2 },
      },
    ]);
  });
});

describe("booleans", () => {
  const cases: [Cell, boolean | null][] = [
    ["yes", true],
    ["Yes", true],
    ["no", false],
    ["NO", false],
    ["sí", true],
    ["SI", true],
    ["si", true],
    ["nó", false],
    ["true", true],
    ["FALSE", false],
    ["1", true],
    ["0", false],
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ["", null],
    [null, null],
  ];

  it.each(cases)("reads %p as %p", (cell, expected) => {
    expect(one({ is_node_manager: cell }).row.isNodeManager).toBe(expected);
  });

  it.each([["maybe"], [2], ["y"], [new Date(Date.UTC(2024, 0, 1))]])(
    "refuses %p with INVALID_BOOLEAN on its column",
    (cell) => {
      const { row, errors } = one({ can_create_spaces: cell });
      expect(row.canCreateSpaces).toBeNull();
      expect(errors).toEqual([
        { row: 2, column: "can_create_spaces", code: "INVALID_BOOLEAN" },
      ]);
    },
  );
});

describe("dates", () => {
  it("reads a date cell as its UTC calendar day", () => {
    expect(
      one({ entry_date: new Date(Date.UTC(2024, 2, 5)) }).row.entryDate,
    ).toBe("2024-03-05");
    expect(
      one({ entry_date: new Date("2024-03-05T23:30:00.000Z") }).row.entryDate,
    ).toBe("2024-03-05");
  });

  it("reads YYYY-MM-DD text that is a real date", () => {
    expect(one({ entry_date: "2024-02-29" }).row.entryDate).toBe("2024-02-29");
    expect(one({ entry_date: " 2025-12-31 " }).row.entryDate).toBe(
      "2025-12-31",
    );
  });

  it.each([
    ["2026-02-30"],
    ["2023-02-29"],
    ["05/03/2024"],
    ["2024-3-5"],
    ["2024-03-05T10:00"],
    [45000],
    [true],
  ])("refuses %p with INVALID_DATE", (cell) => {
    const { row, errors } = one({ entry_date: cell });
    expect(row.entryDate).toBeNull();
    expect(errors).toEqual([
      { row: 2, column: "entry_date", code: "INVALID_DATE" },
    ]);
  });

  it("leaves an empty date empty without an error", () => {
    expect(one({ entry_date: "" })).toEqual(
      expect.objectContaining({ errors: [] }),
    );
    expect(one({ entry_date: "" }).row.entryDate).toBeNull();
  });
});

describe("node_1_code", () => {
  it("is trimmed and upper-cased", () => {
    expect(one({ node_1_code: "  ventas.01/a-b_c " }).row.nodeCode).toBe(
      "VENTAS.01/A-B_C",
    );
  });

  it("reads a numeric code as text", () => {
    expect(one({ node_1_code: 1200 }).row.nodeCode).toBe("1200");
  });

  it("is null when empty, without an error", () => {
    const { row, errors } = one({ node_1_code: "   " });
    expect(row.nodeCode).toBeNull();
    expect(errors).toEqual([]);
  });

  it.each([["a b"], ["ventas ñ"], ["A".repeat(41)], ["código"], ["a,b"]])(
    "refuses %p with NODE_CODE_INVALID and no code",
    (code) => {
      const { row, errors } = one({ node_1_code: code });
      expect(row.nodeCode).toBeNull();
      expect(errors).toEqual([
        { row: 2, column: "node_1_code", code: "NODE_CODE_INVALID" },
      ]);
    },
  );

  it("accepts 40 characters", () => {
    expect(one({ node_1_code: "A".repeat(40) }).errors).toEqual([]);
  });
});

describe("length limits", () => {
  const at = (n: number) => "x".repeat(n);

  it("refuses names, positions and node names over 100 characters", () => {
    const { errors } = one({
      first_name: at(101),
      last_name: at(101),
      position: at(101),
      node_3: at(101),
    });
    expect(codesOf(errors)).toEqual([
      "node_3:TOO_LONG",
      "first_name:TOO_LONG",
      "last_name:TOO_LONG",
      "position:TOO_LONG",
    ]);
    expect(errors[0].params).toEqual({ max: 100 });
  });

  it("accepts exactly 100 characters", () => {
    expect(one({ first_name: at(100), node_2: at(100) }).errors).toEqual([]);
  });

  it("refuses an employee code over 50 characters and accepts 50", () => {
    expect(one({ employee_code: at(50) }).errors).toEqual([]);
    expect(one({ employee_code: at(51) }).errors).toEqual([
      {
        row: 2,
        column: "employee_code",
        code: "TOO_LONG",
        params: { max: 50 },
      },
    ]);
  });
});

it("reports the problems of a row in template column order", () => {
  const { errors } = one({
    email: "",
    is_node_manager: "x",
    entry_date: "2026-02-30",
  });
  expect(codesOf(errors)).toEqual([
    "email:REQUIRED",
    "is_node_manager:INVALID_BOOLEAN",
    "entry_date:INVALID_DATE",
  ]);
});
