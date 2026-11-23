"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { knowApi } from "@/lib/know-api"
import { useTranslations } from "next-intl"

/**
 * One-click page creation: a draft with an empty title is created and the editor opens,
 * where the title is typed inline.
 */
export function useCreatePage(spaceId: string, onCreated?: () => void) {
  const t = useTranslations("know.editor")
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)

  const create = useCallback(
    async (parentId?: string) => {
      setIsCreating(true)
      try {
        const result = await knowApi.createPage(spaceId, {
          title: "",
          status: "DRAFT",
          ...(parentId ? { parentId } : {}),
        })
        onCreated?.()
        router.push(`/know/spaces/${spaceId}/${result.data.id}`)
      } catch {
        toast.error(t("createFailed"))
      } finally {
        setIsCreating(false)
      }
    },
    [spaceId, router, onCreated, t]
  )

  return { create, isCreating }
}
