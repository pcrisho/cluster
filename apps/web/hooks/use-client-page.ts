"use client"

import { useState } from "react"

/**
 * Pages a list that is already in memory for `TablePagination`. Callers reset to page 1 when a filter
 * changes; the page only falls back to the last one when the list shrinks (a row archived or deleted).
 */
export function useClientPage<T>(items: T[], initialSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, lastPage)
  return {
    page: current,
    pageSize,
    total: items.length,
    rows: items.slice((current - 1) * pageSize, current * pageSize),
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  }
}
