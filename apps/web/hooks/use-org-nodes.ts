"use client"

import { useCallback, useEffect, useState } from "react"

import { orgApi, type OrgNode } from "@/lib/org-api"
import { getErrorMessage } from "@/lib/api"

export function useOrgNodes() {
  const [nodes, setNodes] = useState<OrgNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await orgApi.getAreas()
      setNodes(res.data)
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

  return { nodes, isLoading, error, refresh }
}
