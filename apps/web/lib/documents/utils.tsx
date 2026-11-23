import {
  File,
  FileArchive,
  FileChartColumn,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
} from "lucide-react"

import { fileTypeByMime } from "@/lib/documents/file-types"
import { fileTypeLabel } from "./file-types"
import { tPlain } from "@/lib/i18n/plain"

/**
 * Logical icon names. The lucide component is looked up in `ICONS_BY_NAME`
 * so its identity stays stable across renders (`react-hooks/static-components`
 * flags components created inside a render body).
 */
export type DocumentIconName =
  | "pdf"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "chart"
  | "image"
  | "archive"
  | "file"

/** Map a MIME type to a logical icon name, through the shared file catalog. */
export function getMimeIconName(mimetype: string): DocumentIconName {
  const type = fileTypeByMime(mimetype)
  if (!type) return "file"
  if (type.mime.startsWith("image/")) return "image"
  if (type.mime === "application/pdf") return "pdf"
  if (type.mime.startsWith("application/vnd.ms-powerbi")) return "chart"
  if (type.label.startsWith("Word")) return "word"
  if (type.label.startsWith("Excel") || type.mime === "text/csv")
    return "spreadsheet"
  if (type.label.startsWith("PowerPoint")) return "presentation"
  if (type.mime === "application/zip") return "archive"
  return "file"
}

const ICONS_BY_NAME: Record<DocumentIconName, typeof File> = {
  pdf: FileText,
  word: FileType,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  chart: FileChartColumn,
  image: FileImage,
  archive: FileArchive,
  file: File,
}

/** The lucide icon for a MIME type. */
export function DocumentIcon({
  mimetype,
  className,
}: {
  mimetype: string
  className?: string
}) {
  const Icon = ICONS_BY_NAME[getMimeIconName(mimetype)]
  return <Icon className={className} />
}

/** Format a byte count for human display. */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k))
  )
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Human label for a MIME type ("PDF", "Power BI report"), in the person's language. */
export function getMimeLabel(mimetype: string): string {
  return fileTypeLabel(mimetype) ?? tPlain("fileTypes.file")
}
