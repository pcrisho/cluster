"use client"

import { useCallback, useEffect, useState } from "react"

import { orgApi, type Position } from "@/lib/org-api"
import { getErrorMessage } from "@/lib/api"

export function usePositions(includeInactive = false) {
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await orgApi.getPositions(includeInactive)
      setPositions(res.data)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  return { positions, isLoading, error, refresh }
}
