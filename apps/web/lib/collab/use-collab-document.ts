import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { getFreshAccessToken } from "@/lib/api"
import { getCollabUrl } from "./collab-url"
import { createCollabSession, type CollabSession } from "./collab-session"

/**
 * Live collaboration state for one document. Null until the session exists (the effect runs after
 * the first render), so callers render nothing or a placeholder until then.
 */
export function useCollabDocument({ kind, id }: { kind: string; id: string }) {
  const [session, setSession] = useState<CollabSession | null>(null)

  useEffect(() => {
    const created = createCollabSession({
      kind,
      id,
      getToken: getFreshAccessToken,
      url: getCollabUrl(),
    })
    // The session opens a socket, so it cannot be built during render; state is the only way to hand it to React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(created)
    return () => {
      created.destroy()
      setSession(null)
    }
  }, [kind, id])

  const subscribe = useCallback(
    (onChange: () => void) => session?.subscribe(onChange) ?? (() => {}),
    [session]
  )
  const getSnapshot = useCallback(
    () => session?.getSnapshot() ?? null,
    [session]
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
