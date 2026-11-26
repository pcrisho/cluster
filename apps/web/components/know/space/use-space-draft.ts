"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { knowApi, type Space } from "@/lib/know-api"
import { useEntityAutosave, type SavingState } from "@/lib/use-entity-autosave"
import { useTranslations } from "next-intl"

type AutosaveKey = "name" | "icon"

const worstState = (states: SavingState[]): SavingState => {
  if (states.includes("saving")) return "saving"
  if (states.includes("failed")) return "failed"
  if (states.includes("saved")) return "saved"
  return "idle"
}

/**
 * Owns the editable draft for a Space plus the per-field autosave hooks (name, icon; the
 * description is a live document, see `SpaceDescription`). Returns the current draft, an aggregated
 * saving indicator, retry-all, and stable per-field handlers.
 *
 * The draft is NOT synced with the incoming `space` prop after
 * mount — the parent re-fetches on every successful save and we
 * don't want a refetch to clobber pending edits in other fields.
 * Server-controlled metadata (updatedAt, _count, etc.) is read
 * directly from the prop in the consumers.
 */
export function useSpaceDraft(space: Space, onSaved: () => void) {
  const t = useTranslations("know.space")
  const [draft, setDraft] = useState<Space>(space)

  const nameAutosave = useEntityAutosave<string>({
    save: (name) => knowApi.updateSpace(space.id, { name }),
  })
  const iconAutosave = useEntityAutosave<
    Pick<Space, "iconType" | "icon" | "emoji">
  >({
    save: (icon) => knowApi.updateSpace(space.id, icon),
  })

  // The hooks return a new object every render; their functions are stable, so use those.
  const { trigger: triggerName, retry: retryName } = nameAutosave
  const { trigger: triggerIcon, retry: retryIcon } = iconAutosave

  const indicatorState = worstState([nameAutosave.state, iconAutosave.state])

  const retryAll = useCallback(() => {
    retryName()
    retryIcon()
  }, [retryName, retryIcon])

  // Notify the parent on any save → re-fetch the canonical space.
  useEffect(() => {
    if (nameAutosave.state === "saved" || iconAutosave.state === "saved") {
      onSaved()
    }
    // Intentionally not depending on onSaved to avoid re-running
    // when the parent passes a new function ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameAutosave.state, iconAutosave.state])

  // Surface a toast when a save fails. Track each autosave's
  // previous state individually so we fire exactly once per real
  // transition into `failed` (not on every re-render, and not
  // silently swallowed when other fields are in non-failed states).
  const prevStatesRef = useRef<Record<AutosaveKey, SavingState>>({
    name: "idle",
    icon: "idle",
  })
  useEffect(() => {
    const prev = prevStatesRef.current
    const current: Record<AutosaveKey, SavingState> = {
      name: nameAutosave.state,
      icon: iconAutosave.state,
    }
    const justFailed = (Object.keys(current) as AutosaveKey[]).some(
      (k) => current[k] === "failed" && prev[k] !== "failed"
    )
    if (justFailed) {
      toast.error(t("saveFailed"), { description: t("saveFailedHint") })
    }
    prevStatesRef.current = current
  }, [nameAutosave.state, iconAutosave.state, t])

  // Stable per-field handlers. They never change identity across
  // re-renders, which keeps the child components (PageEditor,
  // EntityIconPicker, etc.) from re-binding listeners and looping.
  const handleNameChange = useCallback(
    (value: string) => {
      setDraft((d) => ({ ...d, name: value }))
      triggerName(value)
    },
    [triggerName]
  )
  const handleIconChange = useCallback(
    (next: Pick<Space, "iconType" | "icon" | "emoji">) => {
      setDraft((d) => ({ ...d, ...next }))
      triggerIcon(next)
    },
    [triggerIcon]
  )
  const handleIconRemove = useCallback(() => {
    const next = { iconType: "LUCIDE" as const, icon: "book-open", emoji: null }
    setDraft((d) => ({ ...d, ...next }))
    triggerIcon(next)
  }, [triggerIcon])

  return {
    draft,
    indicatorState,
    retryAll,
    handlers: {
      handleNameChange,
      handleIconChange,
      handleIconRemove,
    },
  }
}
