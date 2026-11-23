/**
 * The file types Cluster accepts, shared by the API (validation), the web (file pickers, messages,
 * previews) and every feature that stores uploads (KNOW pages and spaces, GROW lessons).
 *
 * - `image` kind: shown inside a document body (the `image` node).
 * - `document` kind: attached as a file (`fileCard`, attached files, lesson files); every image
 *   type is also a document, and some (HEIC, SVG) are only that: they are downloaded, never shown.
 * - `video` kind: a GROW video lesson, played by the browser as is (no transcoding).
 * - `spreadsheet` kind: a workbook for the bulk import (`.xlsx` only, read by the API, never shown).
 *
 * Works on `Uint8Array` so it runs in the browser too.
 */

export type FileSignature =
  | "pdf"
  | "zip"
  | "cfb"
  | "text"
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "avif"
  | "heic"
  | "svg"
  | "mp4"
  | "webm";

export type FileKind = "image" | "document" | "video" | "spreadsheet";

export interface FileType {
  /** Canonical type, stored and sent back as `Content-Type`. */
  mime: string;
  /** Other types browsers send for the same files. */
  aliases?: readonly string[];
  /** Lower case, without the dot; the first one names stored objects. */
  extensions: readonly string[];
  label: string;
  signature: FileSignature;
  /** Allowed in a document body. */
  inline: boolean;
  /** Shown in the in-app viewer. */
  preview: boolean;
}

const OOXML = "application/vnd.openxmlformats-officedocument";

export const FILE_TYPES: readonly FileType[] = [
  {
    mime: "image/jpeg",
    aliases: ["image/jpg", "image/pjpeg"],
    extensions: ["jpg", "jpeg"],
    label: "JPEG image",
    signature: "jpeg",
    inline: true,
    preview: true,
  },
  {
    mime: "image/png",
    extensions: ["png"],
    label: "PNG image",
    signature: "png",
    inline: true,
    preview: true,
  },
  {
    mime: "image/webp",
    extensions: ["webp"],
    label: "WebP image",
    signature: "webp",
    inline: true,
    preview: true,
  },
  {
    mime: "image/gif",
    extensions: ["gif"],
    label: "GIF image",
    signature: "gif",
    inline: true,
    preview: true,
  },
  {
    mime: "image/bmp",
    aliases: ["image/x-ms-bmp", "image/x-bmp"],
    extensions: ["bmp"],
    label: "BMP image",
    signature: "bmp",
    inline: true,
    preview: true,
  },
  {
    mime: "image/avif",
    extensions: ["avif"],
    label: "AVIF image",
    signature: "avif",
    inline: true,
    preview: true,
  },
  {
    mime: "image/heic",
    aliases: ["image/heif", "image/heic-sequence", "image/heif-sequence"],
    extensions: ["heic", "heif"],
    label: "HEIC image",
    signature: "heic",
    inline: false,
    preview: false,
  },
  // Never shown: an SVG can carry scripts. Downloaded only.
  {
    mime: "image/svg+xml",
    extensions: ["svg"],
    label: "SVG image",
    signature: "svg",
    inline: false,
    preview: false,
  },
  {
    mime: "application/pdf",
    extensions: ["pdf"],
    label: "PDF",
    signature: "pdf",
    inline: false,
    preview: true,
  },
  {
    mime: "application/msword",
    extensions: ["doc"],
    label: "Word document",
    signature: "cfb",
    inline: false,
    preview: false,
  },
  {
    mime: `${OOXML}.wordprocessingml.document`,
    extensions: ["docx"],
    label: "Word document",
    signature: "zip",
    inline: false,
    preview: false,
  },
  {
    mime: "application/vnd.ms-excel",
    extensions: ["xls"],
    label: "Excel spreadsheet",
    signature: "cfb",
    inline: false,
    preview: false,
  },
  {
    mime: `${OOXML}.spreadsheetml.sheet`,
    extensions: ["xlsx"],
    label: "Excel spreadsheet",
    signature: "zip",
    inline: false,
    preview: false,
  },
  {
    mime: "application/vnd.ms-powerpoint",
    extensions: ["ppt"],
    label: "PowerPoint presentation",
    signature: "cfb",
    inline: false,
    preview: false,
  },
  {
    mime: `${OOXML}.presentationml.presentation`,
    extensions: ["pptx"],
    label: "PowerPoint presentation",
    signature: "zip",
    inline: false,
    preview: false,
  },
  // Power BI has no registered type; browsers send an empty one or application/octet-stream.
  {
    mime: "application/vnd.ms-powerbi",
    extensions: ["pbix"],
    label: "Power BI report",
    signature: "zip",
    inline: false,
    preview: false,
  },
  {
    mime: "application/vnd.ms-powerbi.template",
    extensions: ["pbit"],
    label: "Power BI template",
    signature: "zip",
    inline: false,
    preview: false,
  },
  {
    mime: "text/csv",
    aliases: ["application/csv", "text/x-csv"],
    extensions: ["csv"],
    label: "CSV",
    signature: "text",
    inline: false,
    preview: false,
  },
  {
    mime: "text/plain",
    extensions: ["txt"],
    label: "Text file",
    signature: "text",
    inline: false,
    preview: false,
  },
  {
    mime: "application/zip",
    aliases: ["application/x-zip-compressed", "application/x-zip"],
    extensions: ["zip"],
    label: "ZIP archive",
    signature: "zip",
    inline: false,
    preview: false,
  },
];

/** Played by every current browser without transcoding: MP4 (H.264 + AAC) and WebM. */
export const VIDEO_TYPES: readonly FileType[] = [
  {
    mime: "video/mp4",
    extensions: ["mp4"],
    label: "MP4 video",
    signature: "mp4",
    inline: false,
    preview: false,
  },
  {
    mime: "video/webm",
    extensions: ["webm"],
    label: "WebM video",
    signature: "webm",
    inline: false,
    preview: false,
  },
];

/** The bulk import's workbook: the `.xlsx` entry of the catalog, nothing else. */
export const SPREADSHEET_TYPES: readonly FileType[] = FILE_TYPES.filter((t) =>
  t.extensions.includes("xlsx"),
);

export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const SPREADSHEET_MAX_BYTES = 5 * 1024 * 1024;

export const MAX_BYTES: Record<FileKind, number> = {
  image: IMAGE_MAX_BYTES,
  document: DOCUMENT_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
  spreadsheet: SPREADSHEET_MAX_BYTES,
};

/** Shown when a file is rejected for its type. */
export const TYPE_ERROR: Record<FileKind, string> = {
  image:
    "This image type isn't supported. Use a JPEG, PNG, WebP, GIF, BMP or AVIF image.",
  document:
    "This file type isn't supported. Upload a PDF, Word, Excel, PowerPoint, Power BI, CSV, text, ZIP or image file.",
  video:
    "This video type isn't supported. Upload an MP4 (H.264) or WebM video.",
  spreadsheet: "Only Excel workbooks (.xlsx) can be imported.",
};

/** Shown when a file is over the limit. */
export const SIZE_ERROR: Record<FileKind, string> = {
  image: "Images can be up to 20 MB.",
  document: "Files can be up to 50 MB.",
  video: "Videos can be up to 1 GB.",
  spreadsheet: "Workbooks can be up to 5 MB.",
};

/** Types that say nothing about the file; the extension decides instead. */
const GENERIC_MIMES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

export function typesOfKind(kind: FileKind): readonly FileType[] {
  if (kind === "video") return VIDEO_TYPES;
  if (kind === "spreadsheet") return SPREADSHEET_TYPES;
  return kind === "image" ? FILE_TYPES.filter((t) => t.inline) : FILE_TYPES;
}

export function fileTypeByMime(
  mime: string,
  kind: FileKind = "document",
): FileType | null {
  const m = mime.toLowerCase();
  return (
    typesOfKind(kind).find((t) => t.mime === m || t.aliases?.includes(m)) ??
    null
  );
}

export function fileTypeByName(
  name: string,
  kind: FileKind = "document",
): FileType | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return typesOfKind(kind).find((t) => t.extensions.includes(ext)) ?? null;
}

/**
 * The type a file is stored as, or null when it is not accepted. Candidates are the declared type
 * and the extension; the first whose signature matches the content wins, so a CSV that Windows
 * declares as Excel is still a CSV and a PNG declared as JPEG is rejected.
 */
export function resolveFileType(
  kind: FileKind,
  name: string,
  declaredMime: string,
  content: Uint8Array,
): { mime: string; extension: string; type: FileType } | null {
  const candidates = [
    GENERIC_MIMES.has(declaredMime.toLowerCase())
      ? null
      : fileTypeByMime(declaredMime, kind),
    fileTypeByName(name, kind),
  ];
  for (const type of candidates) {
    if (type && matchesSignature(content, type.signature)) {
      return { mime: type.mime, extension: type.extensions[0], type };
    }
  }
  return null;
}

/** Whether a declared type or file name could be accepted at all (checked before the content arrives). */
export function isCandidateFile(
  kind: FileKind,
  name: string,
  declaredMime: string,
): boolean {
  return !!(fileTypeByMime(declaredMime, kind) ?? fileTypeByName(name, kind));
}

export function canPreview(mime: string): boolean {
  return fileTypeByMime(mime)?.preview ?? false;
}

/** Value for `<input type="file" accept>`: types and extensions. */
export function acceptAttribute(kind: FileKind): string {
  return typesOfKind(kind)
    .flatMap((t) => [t.mime, ...t.extensions.map((e) => `.${e}`)])
    .join(",");
}

export function matchesSignature(
  content: Uint8Array,
  signature: FileSignature,
): boolean {
  const at = (offset: number, ...values: number[]) =>
    content.length >= offset + values.length &&
    values.every((v, i) => content[offset + i] === v);
  const ascii = (offset: number, text: string) =>
    at(offset, ...Array.from(text, (c) => c.charCodeAt(0)));

  switch (signature) {
    case "jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "bmp":
      return ascii(0, "BM") && content.length >= 6;
    case "pdf":
      return ascii(0, "%PDF");
    case "zip":
      return at(0, 0x50, 0x4b) && [0x03, 0x05, 0x07].includes(content[2]);
    case "cfb":
      return at(0, 0xd0, 0xcf, 0x11, 0xe0);
    case "text":
      return isText(content);
    case "avif":
      return ftypBrands(content).some((b) => b === "avif" || b === "avis");
    case "heic": {
      const brands = ftypBrands(content);
      if (brands.some((b) => b === "avif" || b === "avis")) return false;
      return brands.some((b) => HEIF_BRANDS.has(b));
    }
    case "svg":
      return isSvg(content);
    case "mp4": {
      const major = ftypBrands(content)[0];
      return !!major && !NOT_MP4_VIDEO.has(major) && !HEIF_BRANDS.has(major);
    }
    case "webm":
      // EBML header whose DocType is "webm" (Matroska `.mkv` shares the header, often won't play).
      return (
        at(0, 0x1a, 0x45, 0xdf, 0xa3) &&
        String.fromCharCode(...content.subarray(4, 64)).includes("webm")
      );
  }
}

/** `ftyp` major brands that are not an MP4 video a browser plays: QuickTime, still images, audio. */
const NOT_MP4_VIDEO = new Set(["qt  ", "avif", "avis", "M4A ", "M4B ", "M4P "]);

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

/** Major and compatible brands of a leading ISO-BMFF `ftyp` box. */
function ftypBrands(content: Uint8Array): string[] {
  if (content.length < 16) return [];
  const text = (from: number) =>
    String.fromCharCode(...content.subarray(from, from + 4));
  if (text(4) !== "ftyp") return [];
  const size =
    ((content[0] << 24) |
      (content[1] << 16) |
      (content[2] << 8) |
      content[3]) >>>
    0;
  const end = Math.min(size, content.length, 256);
  const brands = [text(8)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(text(i));
  return brands;
}

/** No NUL bytes in the first 8 KB: a best effort, text has no signature. */
function isText(content: Uint8Array): boolean {
  const head = content.subarray(0, 8192);
  return !head.includes(0);
}

/** XML text whose first element is `<svg`, after an optional BOM, declaration, comments and doctype. */
function isSvg(content: Uint8Array): boolean {
  if (!isText(content)) return false;
  const head =
    content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
      ? content.subarray(3, 4096)
      : content.subarray(0, 4096);
  // Latin-1 is enough to find the first element: every character that matters is ASCII.
  const text = String.fromCharCode(...head).replace(
    /^\s*(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|\s+)*/i,
    "",
  );
  return /^<svg[\s>/]/i.test(text);
}
