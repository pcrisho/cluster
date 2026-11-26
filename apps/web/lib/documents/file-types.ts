import {
  MAX_BYTES,
  fileTypeByMime,
  fileTypeByName,
  type FileKind,
  type FileType,
} from "@cluster/editor-schema"
import { tPlain, type MessageKey } from "@/lib/i18n/plain"

export {
  acceptAttribute,
  canPreview,
  fileTypeByMime,
  type FileKind,
  type FileType,
} from "@cluster/editor-schema"

/** What the browser tells about a chosen, pasted or dropped file. */
export interface FileFacts {
  name: string
  type: string
  size: number
}

/** Types that say nothing about the file: the extension decides, as on the server. */
const GENERIC_TYPES = new Set(["", "application/octet-stream"])

/** The catalog entry a file would be stored as: its declared type, else its extension. */
export function catalogType(
  file: Pick<FileFacts, "name" | "type">,
  kind: FileKind = "document"
): FileType | null {
  const declared = GENERIC_TYPES.has(file.type.toLowerCase())
    ? null
    : fileTypeByMime(file.type, kind)
  return declared ?? fileTypeByName(file.name, kind)
}

/**
 * Where a pasted or dropped file goes: an image shown in the body, or a file card. HEIC and SVG
 * are images to the browser but only ever downloaded, so they become file cards.
 */
export function bodyUploadKind(
  file: Pick<FileFacts, "name" | "type">
): FileKind {
  return catalogType(file)?.inline ? "image" : "document"
}

/** The API's error code for a file it would refuse as `kind` (errors.codes in the catalogs). */
const TYPE_PROBLEM = {
  image: "IMAGE_TYPE_UNSUPPORTED",
  document: "FILE_TYPE_UNSUPPORTED",
  video: "VIDEO_TYPE_UNSUPPORTED",
  spreadsheet: "SPREADSHEET_TYPE_UNSUPPORTED",
} as const satisfies Record<FileKind, string>
const SIZE_PROBLEM = {
  image: "IMAGE_TOO_LARGE",
  document: "FILE_TOO_LARGE",
  video: "VIDEO_TOO_LARGE",
  spreadsheet: "SPREADSHEET_TOO_LARGE",
} as const satisfies Record<FileKind, string>

export type UploadProblem =
  | (typeof TYPE_PROBLEM)[FileKind]
  | (typeof SIZE_PROBLEM)[FileKind]

/**
 * Why a file cannot be uploaded as `kind`, as the API's error code, or null when it can. Checked
 * before any request so a rejected file never leaves the browser.
 */
export function uploadProblemCode(
  kind: FileKind,
  file: FileFacts
): UploadProblem | null {
  const type = catalogType(file, kind === "video" ? "video" : "document")
  if (!type || (kind === "image" && !type.inline)) return TYPE_PROBLEM[kind]
  if (file.size > MAX_BYTES[kind]) return SIZE_PROBLEM[kind]
  return null
}

/** The same problem as a message in the person's language, or null. */
export function uploadProblem(kind: FileKind, file: FileFacts): string | null {
  const code = uploadProblemCode(kind, file)
  return (
    code &&
    tPlain(`errors.codes.${code}`, { maxMb: MAX_BYTES[kind] / (1024 * 1024) })
  )
}

/** The catalog's English name of a type ("Power BI report") as its key in `fileTypes`. */
export const fileTypeKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]/g, "")

/** "PDF", "Informe de Power BI"… in the person's language, or null for a type outside the catalog. */
export function fileTypeLabel(mimetype: string): string | null {
  const label = fileTypeByMime(mimetype)?.label
  return label ? tPlain(`fileTypes.${fileTypeKey(label)}` as MessageKey) : null
}
