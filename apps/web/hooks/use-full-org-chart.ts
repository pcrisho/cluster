"use client"

import { useCallback, useEffect, useState } from "react"

import { orgApi, type FullOrgChartData } from "@/lib/org-api"
import { getErrorMessage } from "@/lib/api"
export type { FullOrgChartData }

export function useFullOrgChart() {
  const [data, setData] = useState<FullOrgChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await orgApi.getFullAreas()
      setData(res.data)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  return { data, isLoading, error, refresh }
}
