"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { knowApi, type PageTreeNode, type Space } from "@/lib/know-api"
import { canEditSpace, canManageSpace } from "@/lib/know-roles"
import { tPlain } from "@/lib/i18n/plain"

interface SpaceState {
  spaceId: string
  /** Null until loaded, and when the space is missing or hidden. */
  space: Space | null
  pages: PageTreeNode[]
  isLoading: boolean
  error: string | null
  /** Refetch the space and its page tree without going back to the loading state. */
  refresh: () => Promise<void>
  /** What the API says the signed-in user can do here. */
  canEdit: boolean
  canManage: boolean
}

const SpaceContext = createContext<SpaceState | null>(null)

/** One fetch of the space and its tree, shared by the sidebar, the space home and every page. */
export function SpaceProvider({
  spaceId,
  children,
}: {
  spaceId: string
  children: ReactNode
}) {
  const [space, setSpace] = useState<Space | null>(null)
  const [pages, setPages] = useState<PageTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [spaceResult, treeResult] = await Promise.all([
        knowApi.getSpace(spaceId),
        knowApi.getPageTree(spaceId),
      ])
      setSpace(spaceResult.data)
      setPages(treeResult.data)
      setError(null)
    } catch {
      setError(tPlain("know.space.notFoundBody"))
    } finally {
      setIsLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    Promise.resolve().then(refresh)
  }, [refresh])

  const value = useMemo<SpaceState>(
    () => ({
      spaceId,
      space,
      pages,
      isLoading,
      error,
      refresh,
      canEdit: canEditSpace(space?.myRole),
      canManage: canManageSpace(space?.myRole),
    }),
    [spaceId, space, pages, isLoading, error, refresh]
  )

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
}

export function useSpace(): SpaceState {
  const value = useContext(SpaceContext)
  if (!value) throw new Error("useSpace must be used inside a SpaceProvider")
  return value
}
