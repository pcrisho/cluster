import {
  FileTextIcon,
  FilePenIcon,
  FileArchiveIcon,
  type LucideIcon,
} from "lucide-react"

type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"

const PAGE_STATUS_ICON_MAP: Record<PageStatus, LucideIcon> = {
  PUBLISHED: FileTextIcon,
  DRAFT: FilePenIcon,
  ARCHIVED: FileArchiveIcon,
}

export function getPageStatusIcon(status: PageStatus): LucideIcon {
  return PAGE_STATUS_ICON_MAP[status] ?? FileTextIcon
}

export function getPageStatusVariant(
  status: PageStatus
): "success" | "warning" | "muted" {
  if (status === "PUBLISHED") return "success"
  if (status === "DRAFT") return "warning"
  return "muted"
}
