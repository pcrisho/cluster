/** Name comparison of the import (design D8): accents and case ignored, spaces trimmed and collapsed. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}
