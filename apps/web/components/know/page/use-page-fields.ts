"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import {
  knowApi,
  type PageDetail,
  type PageIconType,
  type PageStatus,
} from "@/lib/know-api"
import type { SavingState } from "@/lib/use-entity-autosave"
import { useTranslations } from "next-intl"

interface IconValue {
  iconType: PageIconType
  icon: string
  emoji: string | null
}

/** Moves the page after its siblings; the API clamps an index past the end. */
const LAST = 10_000

/**
 * The page fields that are saved one at a time (icon, status, parent, tags): shows the change at
 * once, saves it, and puts the old value back if the save fails. Title and body are live.
 */
export function usePageFields(page: PageDetail, onUpdated: () => void) {
  const t = useTranslations("know.fields")
  const [draft, setDraft] = useState<PageDetail>(page)
  const [state, setState] = useState<SavingState>("idle")
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The server copy wins whenever it is fetched again.
  useEffect(() => {
    queueMicrotask(() => setDraft(page))
  }, [page])

  const save = useCallback(
    async (change: Partial<PageDetail>, request: () => Promise<unknown>, failure: string) => {
      setDraft((d) => ({ ...d, ...change }))
      setState("saving")
      try {
        await request()
        if (!mounted.current) return
        setState("saved")
        onUpdated()
        setTimeout(() => mounted.current && setState("idle"), 2000)
      } catch (err) {
        if (!mounted.current) return
        setDraft(page)
        setState("failed")
        toast.error(err instanceof ApiError ? getErrorMessage(err) : failure)
      }
    },
    [page, onUpdated]
  )

  const setIcon = (next: IconValue) =>
    save(next, () => knowApi.updatePage(page.id, next), t("iconFailed"))

  const removeIcon = () => setIcon({ iconType: "LUCIDE", icon: "file-text", emoji: null })

  const setStatus = async (status: PageStatus) => {
    if (status === draft.status) return
    const publishing = status === "PUBLISHED"
    await save({ status }, () => knowApi.updatePage(page.id, { status }), t("statusFailed"))
    // Publishing keeps a version, so the history has the text that people could first read.
    if (publishing) {
      try {
        await knowApi.createPageVersion(page.id)
        toast.success(t("published"))
      } catch {
        toast.error(t("publishedNoVersion"))
      }
    }
  }

  const setParent = (parentId: string | null) =>
    save({ parentId }, () => knowApi.movePage(page.id, { parentId, index: LAST }), t("moveFailed"))

  const setTags = (tagIds: string[]) =>
    save(
      { tags: tagIds.map((id) => ({ tag: { id, name: "" } })) },
      () => knowApi.updatePage(page.id, { tagIds }),
      t("tagsFailed")
    )

  return { draft, state, setIcon, removeIcon, setStatus, setParent, setTags }
}
