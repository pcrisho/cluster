import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  MAX_BYTES,
  SIZE_ERROR,
  TYPE_ERROR,
  VIDEO_MAX_BYTES,
  acceptAttribute,
  canPreview,
  matchesSignature,
  resolveFileType,
  typesOfKind,
} from "./file-types";

const bytes = (...values: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  return Uint8Array.from(out);
};

/** An ISO-BMFF `ftyp` box with a major brand and compatible brands. */
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4;
  return bytes(0, 0, 0, size, "ftyp", major, 0, 0, 0, 0, ...compatible);
};

const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const GIF = bytes("GIF89a", 1, 0, 1, 0);
const BMP = bytes("BM", 0, 0, 0, 0);
const WEBP = bytes("RIFF", 0, 0, 0, 0, "WEBP");
const PDF = bytes("%PDF-1.7");
const ZIP = bytes("PK", 3, 4, 0, 0);
const CFB = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1);
const TEXT = bytes("name,age\nAna,30\n");

describe("matchesSignature", () => {
  it.each([
    ["jpeg", JPEG],
    ["png", PNG],
    ["gif", GIF],
    ["bmp", BMP],
    ["webp", WEBP],
    ["pdf", PDF],
    ["zip", ZIP],
    ["cfb", CFB],
    ["text", TEXT],
    ["avif", ftyp("avif", "mif1", "avif")],
    ["avif", ftyp("mif1", "avif", "miaf")],
    ["heic", ftyp("heic", "mif1", "heic")],
    ["heic", ftyp("mif1", "heic")],
    [
      "svg",
      bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ],
    ["svg", bytes(0xef, 0xbb, 0xbf, "<svg/>")],
  ] as const)("accepts %s", (signature, content) => {
    expect(matchesSignature(content, signature)).toBe(true);
  });

  it.each([
    ["jpeg", PNG],
    ["png", JPEG],
    ["gif", BMP],
    ["pdf", ZIP],
    ["heic", ftyp("avif", "avif")],
    ["avif", ftyp("heic", "heic")],
    ["text", bytes("a", 0, "b")],
    ["svg", bytes("<html><script>alert(1)</script></html>")],
    ["jpeg", bytes(0xff, 0xd8)],
  ] as const)(
    "rejects %s for content of another type",
    (signature, content) => {
      expect(matchesSignature(content, signature)).toBe(false);
    },
  );
});

describe("resolveFileType", () => {
  it("resolves an inline image by its declared type", () => {
    expect(resolveFileType("image", "photo.gif", "image/gif", GIF)?.mime).toBe(
      "image/gif",
    );
    expect(resolveFileType("image", "scan.bmp", "image/bmp", BMP)?.mime).toBe(
      "image/bmp",
    );
  });

  it("rejects content that does not match the declared type", () => {
    expect(resolveFileType("image", "a.jpg", "image/jpeg", PNG)).toBeNull();
    expect(
      resolveFileType("document", "a.pdf", "application/pdf", ZIP),
    ).toBeNull();
  });

  it("keeps download-only images out of the body", () => {
    const heic = ftyp("heic", "mif1", "heic");
    expect(
      resolveFileType("image", "IMG_1.HEIC", "image/heic", heic),
    ).toBeNull();
    expect(
      resolveFileType("document", "IMG_1.HEIC", "image/heic", heic)?.mime,
    ).toBe("image/heic");
    const svg = bytes("<svg/>");
    expect(
      resolveFileType("image", "logo.svg", "image/svg+xml", svg),
    ).toBeNull();
    expect(
      resolveFileType("document", "logo.svg", "image/svg+xml", svg)?.mime,
    ).toBe("image/svg+xml");
  });

  it("falls back to the extension when the browser sends no useful type", () => {
    expect(
      resolveFileType("document", "sales.pbix", "application/octet-stream", ZIP)
        ?.mime,
    ).toBe("application/vnd.ms-powerbi");
    expect(resolveFileType("document", "Sales.PBIT", "", ZIP)?.extension).toBe(
      "pbit",
    );
    expect(
      resolveFileType("document", "IMG_2.heif", "", ftyp("mif1", "heic"))?.mime,
    ).toBe("image/heic");
  });

  it("accepts the aliases browsers send for known types", () => {
    expect(
      resolveFileType("document", "a.zip", "application/x-zip-compressed", ZIP)
        ?.mime,
    ).toBe("application/zip");
    // Windows declares CSV files as Excel; the extension and content decide.
    expect(
      resolveFileType(
        "document",
        "people.csv",
        "application/vnd.ms-excel",
        TEXT,
      )?.mime,
    ).toBe("text/csv");
    expect(resolveFileType("image", "a.jpg", "image/jpg", JPEG)?.mime).toBe(
      "image/jpeg",
    );
  });

  it("rejects unknown types", () => {
    expect(
      resolveFileType(
        "document",
        "run.exe",
        "application/x-msdownload",
        bytes("MZ", 0, 0),
      ),
    ).toBeNull();
    expect(resolveFileType("document", "noext", "", ZIP)).toBeNull();
  });

  it("names the stored extension after the resolved type, never after the file name", () => {
    expect(
      resolveFileType("document", "report.final.PDF", "application/pdf", PDF)
        ?.extension,
    ).toBe("pdf");
    expect(
      resolveFileType("image", "photo.jpeg", "image/jpeg", JPEG)?.extension,
    ).toBe("jpg");
  });
});

describe("limits and helpers", () => {
  it("allows bigger documents than images", () => {
    expect(IMAGE_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(DOCUMENT_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it("previews PDFs and inline images only", () => {
    expect(canPreview("application/pdf")).toBe(true);
    expect(canPreview("image/avif")).toBe(true);
    expect(canPreview("image/svg+xml")).toBe(false);
    expect(canPreview("image/heic")).toBe(false);
    expect(
      canPreview(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
  });

  it("builds the file picker accept list from the catalog", () => {
    expect(acceptAttribute("image").split(",")).toEqual(
      expect.arrayContaining(["image/gif", "image/bmp", "image/avif", ".gif"]),
    );
    expect(acceptAttribute("image")).not.toContain("heic");
    expect(acceptAttribute("document")).toContain(".pbix");
    expect(acceptAttribute("document")).toContain(".heic");
  });
});

describe("video", () => {
  const MP4 = ftyp("isom", "isom", "iso2", "avc1", "mp41");
  const WEBM = bytes(
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0x9f,
    0x42,
    0x86,
    0x81,
    1,
    0x42,
    0x82,
    0x84,
    "webm",
  );
  const MKV = bytes(
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0x9f,
    0x42,
    0x86,
    0x81,
    1,
    0x42,
    0x82,
    0x88,
    "matroska",
  );

  it("accepts MP4 and WebM by their content", () => {
    expect(
      resolveFileType("video", "intro.mp4", "video/mp4", MP4),
    ).toMatchObject({
      mime: "video/mp4",
      extension: "mp4",
    });
    expect(
      resolveFileType("video", "intro.webm", "video/webm", WEBM),
    ).toMatchObject({
      mime: "video/webm",
      extension: "webm",
    });
    expect(
      resolveFileType("video", "intro.mp4", "", ftyp("mp42", "mp42", "isom"))
        ?.mime,
    ).toBe("video/mp4");
  });

  it("rejects QuickTime, HEIF, AVIF, audio-only MP4, Matroska and other files named as video", () => {
    expect(
      resolveFileType("video", "clip.mp4", "video/mp4", ftyp("qt  ", "qt  ")),
    ).toBeNull();
    expect(
      resolveFileType("video", "clip.mp4", "video/mp4", ftyp("heic", "mif1")),
    ).toBeNull();
    expect(
      resolveFileType("video", "clip.mp4", "video/mp4", ftyp("avif", "avif")),
    ).toBeNull();
    expect(
      resolveFileType("video", "song.mp4", "video/mp4", ftyp("M4A ", "M4A ")),
    ).toBeNull();
    expect(resolveFileType("video", "clip.webm", "video/webm", MKV)).toBeNull();
    expect(resolveFileType("video", "clip.mp4", "video/mp4", PNG)).toBeNull();
  });

  it("keeps videos out of images and documents, and documents out of videos", () => {
    expect(
      resolveFileType("document", "intro.mp4", "video/mp4", MP4),
    ).toBeNull();
    expect(resolveFileType("image", "intro.mp4", "video/mp4", MP4)).toBeNull();
    expect(
      resolveFileType("video", "manual.pdf", "application/pdf", PDF),
    ).toBeNull();
    expect(acceptAttribute("video").split(",")).toEqual([
      "video/mp4",
      ".mp4",
      "video/webm",
      ".webm",
    ]);
  });

  it("allows videos up to 1 GB", () => {
    expect(VIDEO_MAX_BYTES).toBe(1024 * 1024 * 1024);
  });
});

describe("spreadsheet", () => {
  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  it("accepts only .xlsx workbooks, up to 5 MB", () => {
    expect(typesOfKind("spreadsheet").map((t) => t.extensions)).toEqual([
      ["xlsx"],
    ]);
    expect(MAX_BYTES.spreadsheet).toBe(5 * 1024 * 1024);
    expect(TYPE_ERROR.spreadsheet).toBe(
      "Only Excel workbooks (.xlsx) can be imported.",
    );
    expect(SIZE_ERROR.spreadsheet).toBe("Workbooks can be up to 5 MB.");
  });

  it("resolves a workbook by its declared type, its extension or a generic type", () => {
    expect(
      resolveFileType("spreadsheet", "people.xlsx", XLSX_MIME, ZIP)?.mime,
    ).toBe(XLSX_MIME);
    expect(
      resolveFileType(
        "spreadsheet",
        "people.xlsx",
        "application/octet-stream",
        ZIP,
      )?.extension,
    ).toBe("xlsx");
  });

  it("refuses everything else, old Excel and CSV included", () => {
    expect(
      resolveFileType("spreadsheet", "people.csv", "text/csv", TEXT),
    ).toBeNull();
    expect(
      resolveFileType(
        "spreadsheet",
        "people.xls",
        "application/vnd.ms-excel",
        CFB,
      ),
    ).toBeNull();
    expect(
      resolveFileType("spreadsheet", "people.pdf", "application/pdf", PDF),
    ).toBeNull();
    // A workbook renamed to .xlsx but holding text is refused by its content.
    expect(
      resolveFileType("spreadsheet", "people.xlsx", XLSX_MIME, TEXT),
    ).toBeNull();
    expect(acceptAttribute("spreadsheet").split(",")).toEqual([
      XLSX_MIME,
      ".xlsx",
    ]);
  });
});
