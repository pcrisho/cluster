import {
  isTransactionOrigin,
  type onChangePayload,
  type onLoadDocumentPayload,
  type onStoreDocumentPayload,
} from "@hocuspocus/server"
import { CollabApiError, type ApiClient } from "../api-client"
import {
  InvalidContentError,
  encodeState,
  fieldsToYdoc,
  replaceFields,
  ydocToRepairedFields,
} from "../convert"
import { parseDocumentName } from "../document-name"
import type { Log } from "../log"

type Api = Pick<ApiClient, "loadDocument" | "seedDocument" | "storeDocument">

export interface DocumentHooksOptions {
  /** Waits before each retry of a save while the API is unavailable (tests pass zeros). */
  retryDelaysMs?: number[]
}

const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]

/** Close codes the browser reads to tell the person why the session ended. */
export const DELETED = { code: 4404, reason: "document-deleted" }
const REJECTIONS = {
  invalid: { code: 4422, reason: "invalid-content" },
  too_large: { code: 4413, reason: "document-too-large" },
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Loads, seeds and saves documents through the API. The API is the only one that touches the
 * database; this service keeps live documents in memory and decides what happens when a save
 * cannot go through.
 */
export function createDocumentHooks(
  api: Api,
  log: Log,
  options: DocumentHooksOptions = {}
) {
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  /** People who changed each document since its last save, most recent last. */
  const editorsByDocument = new Map<string, Set<string>>()
  /** Documents whose page no longer exists: they are never saved again. */
  const deleted = new Set<string>()
  /** Documents whose last save failed. Hocuspocus swallows that error, so a flush asks here. */
  const failed = new Set<string>()

  /**
   * Returns the state Hocuspocus applies to the new document. A page never opened has no state:
   * it is built from the page content and persisted once; whoever loses a race to seed serves the
   * winner's state, because two independent seeds would duplicate the content when merged.
   */
  async function load(documentName: string): Promise<Uint8Array> {
    const { kind, id } = parseDocumentName(documentName)
    let loaded = await api.loadDocument(kind, id)
    if (loaded.ydoc) return loaded.ydoc

    const state = encodeState(fieldsToYdoc(loaded.fields))
    try {
      await api.seedDocument(kind, id, state)
      return state
    } catch (error) {
      if (!(error instanceof CollabApiError) || error.kind !== "conflict")
        throw error
    }
    loaded = await api.loadDocument(kind, id)
    if (!loaded.ydoc)
      throw new Error("Document has no state after a seed conflict")
    return loaded.ydoc
  }

  const onLoadDocument = async ({ documentName }: onLoadDocumentPayload) => {
    try {
      return await load(documentName)
    } catch (error) {
      log("load-failed", { documentName, reason: describe(error) })
      throw error
    }
  }

  const onChange = async ({ documentName, context }: onChangePayload) => {
    const userId = context?.userId
    if (typeof userId !== "string") return
    const editors = editorsByDocument.get(documentName) ?? new Set<string>()
    editors.delete(userId)
    editors.add(userId)
    editorsByDocument.set(documentName, editors)
  }

  async function storeWithRetry(
    kind: string,
    id: string,
    input: Parameters<Api["storeDocument"]>[2]
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await api.storeDocument(kind, id, input)
      } catch (error) {
        const retryable =
          error instanceof CollabApiError && error.kind === "unavailable"
        if (!retryable || attempt >= retryDelays.length) throw error
        await sleep(retryDelays[attempt])
      }
    }
  }

  /**
   * The live document holds something that cannot be saved. The person who made the last change
   * loses their session and the document goes back to the last saved content; adding the saved
   * state on top would change nothing, so the saved fields are written over the live document.
   */
  async function rejectChanges(
    payload: onStoreDocumentPayload,
    rejection: (typeof REJECTIONS)[keyof typeof REJECTIONS]
  ) {
    const { documentName, document, lastTransactionOrigin } = payload
    const { kind, id } = parseDocumentName(documentName)
    const author =
      isTransactionOrigin(lastTransactionOrigin) &&
      lastTransactionOrigin.source === "connection"
        ? lastTransactionOrigin.connection
        : undefined
    author?.close(rejection)
    log("changes-rejected", {
      documentName,
      reason: rejection.reason,
      userId: author?.context?.userId,
    })
    const lastGood = await api.loadDocument(kind, id)
    replaceFields(document, lastGood.fields)
  }

  const onStoreDocument = async (payload: onStoreDocumentPayload) => {
    const { documentName, document } = payload
    if (deleted.has(documentName)) return
    const { kind, id } = parseDocumentName(documentName)

    let fields
    try {
      const read = ydocToRepairedFields(document)
      fields = read.fields
      if (read.repaired) {
        // Concurrent edits left an empty container: clean the live document so everyone converges.
        replaceFields(document, fields)
        log("structure-repaired", { documentName })
      }
    } catch (error) {
      if (error instanceof InvalidContentError)
        return rejectChanges(payload, REJECTIONS.invalid)
      throw error
    }

    const editors = [...(editorsByDocument.get(documentName) ?? [])]
    try {
      await storeWithRetry(kind, id, {
        ydoc: encodeState(document),
        fields,
        editors,
      })
    } catch (error) {
      if (error instanceof CollabApiError) {
        if (error.kind === "not_found") {
          discard(documentName)
          for (const connection of document.getConnections())
            connection.close(DELETED)
          log("document-deleted", { documentName })
          return
        }
        if (error.kind === "invalid")
          return rejectChanges(payload, REJECTIONS.invalid)
        if (error.kind === "too_large")
          return rejectChanges(payload, REJECTIONS.too_large)
      }
      // Hocuspocus keeps the document in memory; the next change or the next call tries again.
      log("store-failed", { documentName, reason: describe(error) })
      failed.add(documentName)
      throw error
    }
    failed.delete(documentName)
    const pending = editorsByDocument.get(documentName)
    for (const editor of editors) pending?.delete(editor)
  }

  /** The page is gone: close what is left and never save this document again. */
  function discard(documentName: string) {
    deleted.add(documentName)
    editorsByDocument.delete(documentName)
  }

  const storeFailed = (documentName: string) => failed.has(documentName)

  return { onLoadDocument, onChange, onStoreDocument, discard, storeFailed }
}

function describe(error: unknown): string {
  return error instanceof CollabApiError
    ? error.kind
    : error instanceof Error
      ? error.name
      : "unknown"
}
