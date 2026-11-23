"use client"

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useRef,
  useState,
} from "react"

export type SavingState = "idle" | "saving" | "saved" | "failed"

interface UseEntityAutosaveOptions<T> {
  /** Persists one value, e.g. `(name) => knowApi.updateSpace(id, { name })`. Rejects on failure. */
  save: (value: T) => Promise<unknown>
  /** Debounce in ms. Default 1500. */
  debounceMs?: number
}

interface UseEntityAutosaveResult<T> {
  state: SavingState
  /** Schedule a save with the given value. Debounced. */
  trigger: (value: T) => void
  /** Re-attempt the last failed save. */
  retry: () => void
  /** Cancel pending + best-effort flush. Useful on unmount. */
  flush: () => Promise<void>
}

const SAVED_DISPLAY_MS = 5000
const STUCK_SAVING_TIMEOUT_MS = 8000

/**
 * Per-field autosave for any entity (a space today, a course next).
 *
 * State machine:
 *   idle → saving → saved → idle (after SAVED_DISPLAY_MS, 5s)
 *                 → failed → (retry) → saving → ...
 *
 * - Debounce: 1500ms by default. Rapid edits collapse to a single
 *   PATCH with the latest value.
 * - Queue: only one in-flight PATCH at a time. New triggers while a
 *   save is running are appended to a one-slot queue and sent
 *   immediately after the current PATCH resolves (no extra debounce
 *   timer is scheduled while a save is in flight).
 * - Failure: the value is re-queued and `state` is `failed`. The
 *   caller should show a "Retry" affordance and the user input is
 *   NOT discarded (the caller still holds the value).
 * - Unmount: any pending value is flushed best-effort.
 * - beforeunload: warns the user if a save is in flight or failed.
 * - Safety net: if `saving` is reported for longer than
 *   STUCK_SAVING_TIMEOUT_MS, we force-reset to `idle`. This protects
 *   the UI from a stuck spinner in the (hopefully rare) case of a
 *   race condition we haven't reproduced yet.
 *
 * The hook does NOT take ownership of the input value — the caller
 * keeps the draft locally and calls `trigger(value)` when it wants
 * to persist.
 */
export function useEntityAutosave<T>({
  save,
  debounceMs = 1500,
}: UseEntityAutosaveOptions<T>): UseEntityAutosaveResult<T> {
  const [state, setState] = useState<SavingState>("idle")

  const queuedValueRef = useRef<T | null>(null)
  const hasQueuedValueRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const mountedRef = useRef(true)
  const stuckWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the latest `save` in a ref so flush/trigger stay stable across
  // re-renders. Without this, an inline arrow passed as `save` (new
  // reference each render) would change flush → trigger, making the
  // cleanup effect run on every render and set mountedRef.current = false
  // prematurely.
  const saveRef = useRef(save)
  // useInsertionEffect runs synchronously before any DOM mutations and
  // before effects read the ref, so this is the right place to keep
  // the ref in sync with the latest prop. Writing the ref during
  // render itself is forbidden by react-hooks/refs.
  useInsertionEffect(() => {
    saveRef.current = save
  })

  const clearStuckWatchdog = useCallback(() => {
    if (stuckWatchdogRef.current) {
      clearTimeout(stuckWatchdogRef.current)
      stuckWatchdogRef.current = null
    }
  }, [])

  const armStuckWatchdog = useCallback(() => {
    clearStuckWatchdog()
    stuckWatchdogRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      inFlightRef.current = null
      setState((s) => (s === "saving" ? "idle" : s))
    }, STUCK_SAVING_TIMEOUT_MS)
  }, [clearStuckWatchdog])

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) {
      await inFlightRef.current
      return
    }

    setState("saving")
    armStuckWatchdog()

    const run = async () => {
      try {
        while (hasQueuedValueRef.current && mountedRef.current) {
          const value = queuedValueRef.current as T
          queuedValueRef.current = null
          hasQueuedValueRef.current = false
          try {
            await saveRef.current(value)
            if (!mountedRef.current) return
          } catch {
            if (!mountedRef.current) return
            queuedValueRef.current = value
            hasQueuedValueRef.current = true
            setState("failed")
            clearStuckWatchdog()
            return
          }
        }
        if (!mountedRef.current) return
        clearStuckWatchdog()
        setState("saved")
        setTimeout(() => {
          if (mountedRef.current) {
            setState((s) => (s === "saved" ? "idle" : s))
          }
        }, SAVED_DISPLAY_MS)
      } finally {
        inFlightRef.current = null
        // Re-schedule if a value was queued while we were saving.
        // This handles the race where trigger() returned early because
        // inFlight was set, but the queue was not drained before we
        // reset inFlight to null.
        if (hasQueuedValueRef.current && mountedRef.current) {
          timerRef.current = setTimeout(() => {
            void flush()
          }, 0)
        }
      }
    }

    inFlightRef.current = run()
    await inFlightRef.current
  }, [armStuckWatchdog, clearStuckWatchdog])

  const trigger = useCallback(
    (value: T) => {
      queuedValueRef.current = value
      hasQueuedValueRef.current = true
      if (inFlightRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void flush()
      }, debounceMs)
    },
    [debounceMs, flush]
  )

  const retry = useCallback(() => {
    if (state === "failed" && hasQueuedValueRef.current) {
      void flush()
    }
  }, [state, flush])

  // Track the real component lifecycle. This effect has empty deps so its
  // cleanup only runs on actual unmount — never on re-renders. Keeping it
  // separate from the flush-cleanup effect prevents flush reference
  // changes from prematurely setting mountedRef to false while a PATCH is
  // still in-flight, which was the root cause of the "Saving…" stuck state.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Cancel any pending timer and best-effort flush on unmount. Because
  // flush is stable (saveRef pattern), this effect
  // only re-runs when the component actually unmounts.
  useEffect(() => {
    return () => {
      clearStuckWatchdog()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (hasQueuedValueRef.current) {
        void flush()
      }
    }
  }, [flush, clearStuckWatchdog])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        state === "saving" ||
        (state === "failed" && hasQueuedValueRef.current) ||
        hasQueuedValueRef.current
      ) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [state])

  return { state, trigger, retry, flush }
}
