import { tPlain } from "@/lib/i18n/plain"

/** Pages are created without a title; every list shows "Untitled" (in the person's language) instead of an empty row. */
export function pageTitle(title: string | null | undefined): string {
  return title?.trim() || tPlain("know.untitled")
}
