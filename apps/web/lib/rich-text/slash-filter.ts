export interface SearchableSlashItem {
  title: string
  description: string
  searchTerms: string[]
}

/**
 * Case-insensitive substring match on title, description and search
 * terms. An empty query keeps every item.
 */
export function filterSlashItems<T extends SearchableSlashItem>(
  items: T[],
  query: string
): T[] {
  if (!query) return items
  const q = query.toLowerCase()
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.searchTerms.some((term) => term.toLowerCase().includes(q))
  )
}
