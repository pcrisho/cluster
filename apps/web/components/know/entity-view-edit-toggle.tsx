"use client"

import { useCallback, useEffect, useState } from "react"
import { EyeIcon, PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

interface EntityViewEditToggleProps {
  /**
   * The full sessionStorage key under which the editing mode is
   * persisted. Caller is responsible for namespacing (e.g.
   * `know:space:edit:{spaceId}` or `know:page:edit:{pageId}`).
   */
  storageKey: string
  /**
   * If true (default), the entity opens in edit mode for users with
   * edit rights. The toggle then reads as "Read" to flip into view
   * mode. If false, the entity opens in view mode and the toggle
   * reads as "Edit" to flip into edit mode. Editors should always
   * pass `true` (the default) so they land in the editable surface.
   */
  defaultEditing?: boolean
  /** Notify parent when the mode changes so it can re-render. */
  onChange?: (isEditing: boolean) => void
}

/**
 * View/Edit toggle for any entity. Persists the chosen mode in
 * sessionStorage so a refresh keeps the user in the same mode.
 *
 * The caller chooses the storage key, which means the toggle works
 * for Space, Page, or any future entity without component changes.
 */
export function EntityViewEditToggle({
  storageKey,
  defaultEditing = true,
  onChange,
}: EntityViewEditToggleProps) {
  const t = useTranslations("know.editor")
  // Read the persisted value during the initial render via a lazy
  // initializer. On the server, `window` is undefined so we fall
  // back to the default. On the client the first render may briefly
  // disagree with the server-rendered HTML, but `hydrated` below
  // gates the visible button label to prevent flicker.
  const [isEditing, setIsEditing] = useState(() => {
    if (typeof window === "undefined") return defaultEditing
    const stored = window.sessionStorage.getItem(storageKey)
    if (stored === "true") return true
    if (stored === "false") return false
    return defaultEditing
  })
  const [hydrated, setHydrated] = useState(false)

  // Mark hydrated after the first client commit so the visible
  // button label switches from the server default to the real
  // persisted value without causing a layout shift on the second
  // render.
  useEffect(() => {
    queueMicrotask(() => setHydrated(true))
  }, [])

  const toggle = useCallback(() => {
    // Compute the new value once, then apply it to all the places
    // that need to know. We do NOT call onChange inside the
    // setIsEditing updater because the updater runs during render
    // and triggering a parent state update from there raises
    // "Cannot update a component while rendering a different
    // component" (React 18+).
    const next = !isEditing
    setIsEditing(next)
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, String(next))
    }
    onChange?.(next)
  }, [isEditing, storageKey, onChange])

  // Avoid hydration mismatch: render the default state on the server
  // and until the client commits. We mirror the button the
  // user will see once hydrated so the layout doesn't shift.
  const showRead = hydrated ? isEditing : defaultEditing

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={!hydrated}
      aria-pressed={isEditing}
    >
      {showRead ? (
        <>
          <EyeIcon data-icon="inline-start" />
          {t("read")}
        </>
      ) : (
        <>
          <PencilIcon data-icon="inline-start" />
          {t("edit")}
        </>
      )}
    </Button>
  )
}
