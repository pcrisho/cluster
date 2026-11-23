import { CollabApiError } from "../api-client"
import type { CollabFields, CollabSession, LoadedDocument } from "../types"

interface Page {
  ydoc: Uint8Array | null
  revision: number
  fields: CollabFields
}

export interface StoredCall {
  ydoc: Uint8Array
  fields: CollabFields
  editors: string[]
}

/** The API's internal collab routes, in memory, for tests of the service. */
export function createFakeApi() {
  const sessions: Record<string, CollabSession> = {}
  /** People whose access was revoked: authorize-user answers 403 for them. */
  const denied = new Set<string>()
  /** Calls to authorize-user, in order. */
  const rechecks: { userId: string; documentName: string }[] = []
  const pages = new Map<string, Page>()
  const stored: StoredCall[] = []
  const state = {
    down: false,
    seeds: 0,
    /** Errors thrown by the next saves, one each. */
    storeErrors: [] as CollabApiError[],
  }

  const unavailable = () => new CollabApiError("unavailable", undefined, "down")
  const pageOf = (kind: string, id: string) => {
    if (state.down) throw unavailable()
    const page = pages.get(`${kind}:${id}`)
    if (!page) throw new CollabApiError("not_found", 404, "no page")
    return page
  }

  return {
    sessions,
    denied,
    rechecks,
    pages,
    stored,
    state,
    authorize: async (
      token: string,
      _documentName: string
    ): Promise<CollabSession> => {
      if (state.down) throw unavailable()
      const session = sessions[token]
      if (!session)
        throw new CollabApiError("unauthorized", 401, "unknown token")
      return session
    },
    authorizeUser: async (
      userId: string,
      documentName: string
    ): Promise<CollabSession> => {
      if (state.down) throw unavailable()
      rechecks.push({ userId, documentName })
      const session = Object.values(sessions).find((s) => s.userId === userId)
      if (!session || denied.has(userId))
        throw new CollabApiError("forbidden", 403, "no access")
      return session
    },
    loadDocument: async (kind: string, id: string): Promise<LoadedDocument> => {
      const page = pageOf(kind, id)
      return { ydoc: page.ydoc, revision: page.revision, fields: page.fields }
    },
    seedDocument: async (
      kind: string,
      id: string,
      ydoc: Uint8Array
    ): Promise<void> => {
      const page = pageOf(kind, id)
      if (page.ydoc) throw new CollabApiError("conflict", 409, "already seeded")
      state.seeds += 1
      page.ydoc = ydoc
      page.revision = 1
    },
    storeDocument: async (
      kind: string,
      id: string,
      input: StoredCall
    ): Promise<void> => {
      const failure = state.storeErrors.shift()
      if (failure) throw failure
      const page = pageOf(kind, id)
      stored.push(input)
      page.ydoc = input.ydoc
      page.revision += 1
      page.fields = input.fields
    },
  }
}
