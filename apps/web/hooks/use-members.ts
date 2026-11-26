"use client"

import { useState, useEffect, useCallback, useMemo } from "react"

import { adminApi, type Member } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"

export interface MemberStats {
  total: number
  assigned: number
  unassigned: number
}

/**
 * Active members with their area and position, from the core members API (admin).
 * Shared by the assignments screens so counts stay consistent across views.
 */
export function useMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const refresh = useCallback(async () => {
    setError(null)
    try {
      // shortcut: the assignment tree needs every active person at once, so read the pages in turn (100 each);
      // move the tree to server-side loading before organizations reach several thousand people.
      const all: Member[] = []
      for (let page = 1; ; page++) {
        const result = await adminApi.listMembers({
          status: "ENABLED",
          pageSize: 100,
          page,
        })
        all.push(...result.items)
        if (all.length >= result.total || result.items.length === 0) break
      }
      setMembers(all)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  const stats = useMemo<MemberStats>(() => {
    const unassigned = members.filter((m) => !m.profile?.orgNode).length
    return {
      total: members.length,
      assigned: members.length - unassigned,
      unassigned,
    }
  }, [members])

  return { members, isLoading, error, search, setSearch, stats, refresh }
}
