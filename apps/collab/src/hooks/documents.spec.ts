import * as Y from "yjs"
import { CollabApiError } from "../api-client"
import {
  InvalidContentError,
  decodeState,
  encodeState,
  fieldsToYdoc,
  ydocToFields,
  ydocToRepairedFields,
} from "../convert"
import type { CollabFields } from "../types"
import { createDocumentHooks } from "./documents"

const NAME = "know.page:00000000-0000-4000-8000-000000000001"
const KIND = "know.page"
const ID = "00000000-0000-4000-8000-000000000001"

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})
const fields = (text: string, title = "Title"): CollabFields => ({
  body: { type: "doc", content: [paragraph(text)] },
  title,
})
const GOOD = fields("last good text", "Good title")

const apiError = (
  kind: ConstructorParameters<typeof CollabApiError>[0],
  status?: number
) => new CollabApiError(kind, status, kind)

const setup = (retryDelaysMs: number[] = [0, 0]) => {
  const api = {
    loadDocument: jest.fn(),
    seedDocument: jest.fn(),
    storeDocument: jest.fn(),
  }
  const log = jest.fn()
  const hooks = createDocumentHooks(api, log, { retryDelaysMs })
  return { api, log, hooks }
}

interface FakeConnection {
  context: { userId: string }
  close: jest.Mock
}
const connection = (userId: string): FakeConnection => ({
  context: { userId },
  close: jest.fn(),
})

/** A live document as Hocuspocus hands it to onStoreDocument. */
const liveDocument = (f: CollabFields, connections: FakeConnection[] = []) =>
  Object.assign(fieldsToYdoc(f), {
    name: NAME,
    getConnections: () => connections,
  })

const storePayload = (
  document: ReturnType<typeof liveDocument>,
  author?: FakeConnection
) =>
  ({
    documentName: NAME,
    document,
    lastTransactionOrigin: author
      ? { source: "connection", connection: author }
      : { source: "local" },
    lastContext: author?.context ?? {},
  }) as never

describe("onLoadDocument", () => {
  it("returns the stored state without seeding", async () => {
    const { api, hooks } = setup()
    const state = encodeState(fieldsToYdoc(GOOD))
    api.loadDocument.mockResolvedValue({
      ydoc: state,
      revision: 3,
      fields: GOOD,
    })
    const loaded = await hooks.onLoadDocument({ documentName: NAME } as never)
    expect(loaded).toEqual(state)
    expect(api.loadDocument).toHaveBeenCalledWith(KIND, ID)
    expect(api.seedDocument).not.toHaveBeenCalled()
  })

  it("seeds a page that was never opened from its content, and serves exactly what it persisted", async () => {
    const { api, hooks } = setup()
    api.loadDocument.mockResolvedValue({
      ydoc: null,
      revision: 0,
      fields: GOOD,
    })
    api.seedDocument.mockResolvedValue(undefined)
    const loaded = (await hooks.onLoadDocument({
      documentName: NAME,
    } as never)) as Uint8Array
    const [kind, id, seededState] = api.seedDocument.mock.calls[0]
    expect([kind, id]).toEqual([KIND, ID])
    expect(Buffer.from(loaded).equals(Buffer.from(seededState))).toBe(true)
    expect(ydocToFields(decodeState(loaded))).toEqual({
      body: expect.anything(),
      title: "Good title",
    })
  })

  it("serves the winner's state when someone else seeded first (409), never its own", async () => {
    const { api, hooks } = setup()
    const winner = encodeState(fieldsToYdoc(fields("winner text")))
    api.loadDocument
      .mockResolvedValueOnce({ ydoc: null, revision: 0, fields: GOOD })
      .mockResolvedValueOnce({ ydoc: winner, revision: 1, fields: GOOD })
    api.seedDocument.mockRejectedValue(apiError("conflict", 409))
    const loaded = (await hooks.onLoadDocument({
      documentName: NAME,
    } as never)) as Uint8Array
    expect(Buffer.from(loaded).equals(Buffer.from(winner))).toBe(true)
    expect(api.loadDocument).toHaveBeenCalledTimes(2)
  })

  it("fails when a seed conflict leaves no state to load", async () => {
    const { api, hooks } = setup()
    api.loadDocument.mockResolvedValue({
      ydoc: null,
      revision: 0,
      fields: GOOD,
    })
    api.seedDocument.mockRejectedValue(apiError("conflict", 409))
    await expect(
      hooks.onLoadDocument({ documentName: NAME } as never)
    ).rejects.toThrow()
  })

  it("refuses to seed content the schema does not accept", async () => {
    const { api, hooks, log } = setup()
    api.loadDocument.mockResolvedValue({
      ydoc: null,
      revision: 0,
      fields: {
        body: { type: "doc", content: [{ type: "scriptNode" }] },
        title: "x",
      },
    })
    await expect(
      hooks.onLoadDocument({ documentName: NAME } as never)
    ).rejects.toThrow(InvalidContentError)
    expect(api.seedDocument).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      "load-failed",
      expect.objectContaining({ documentName: NAME })
    )
  })

  it.each(["not_found", "unavailable"] as const)(
    "fails the load on %s",
    async (kind) => {
      const { api, hooks } = setup()
      api.loadDocument.mockRejectedValue(apiError(kind))
      await expect(
        hooks.onLoadDocument({ documentName: NAME } as never)
      ).rejects.toBeInstanceOf(CollabApiError)
    }
  )
})

describe("onStoreDocument", () => {
  const changeBy = (hooks: ReturnType<typeof setup>["hooks"], userId: string) =>
    hooks.onChange({ documentName: NAME, context: { userId } } as never)

  it("sends the state, the derived fields and the editors, most recent last", async () => {
    const { api, hooks } = setup()
    api.storeDocument.mockResolvedValue(undefined)
    const document = liveDocument(fields("edited text", "Edited"))
    await changeBy(hooks, "ana")
    await changeBy(hooks, "ben")
    await changeBy(hooks, "ana")
    await hooks.onStoreDocument(storePayload(document))

    const [kind, id, input] = api.storeDocument.mock.calls[0]
    expect([kind, id]).toEqual([KIND, ID])
    expect(input.editors).toEqual(["ben", "ana"])
    expect(input.fields.title).toBe("Edited")
    expect(
      Buffer.from(input.ydoc).equals(Buffer.from(encodeState(document)))
    ).toBe(true)
  })

  it("forgets the editors it saved, and ignores changes that have no person (server-side writes)", async () => {
    const { api, hooks } = setup()
    api.storeDocument.mockResolvedValue(undefined)
    const document = liveDocument(GOOD)
    await changeBy(hooks, "ana")
    await hooks.onChange({ documentName: NAME, context: {} } as never)
    await hooks.onStoreDocument(storePayload(document))
    await hooks.onStoreDocument(storePayload(document))
    expect(api.storeDocument.mock.calls[0][2].editors).toEqual(["ana"])
    expect(api.storeDocument.mock.calls[1][2].editors).toEqual([])
  })

  it("keeps editors apart per document", async () => {
    const { api, hooks } = setup()
    api.storeDocument.mockResolvedValue(undefined)
    await hooks.onChange({
      documentName: "know.page:00000000-0000-4000-8000-0000000000ff",
      context: { userId: "zoe" },
    } as never)
    await changeBy(hooks, "ana")
    await hooks.onStoreDocument(storePayload(liveDocument(GOOD)))
    expect(api.storeDocument.mock.calls[0][2].editors).toEqual(["ana"])
  })

  it("retries when the API is unavailable and keeps the editors until it works", async () => {
    const { api, hooks } = setup([0, 0, 0])
    api.storeDocument
      .mockRejectedValueOnce(apiError("unavailable"))
      .mockRejectedValueOnce(apiError("unavailable"))
      .mockResolvedValueOnce(undefined)
    await changeBy(hooks, "ana")
    await hooks.onStoreDocument(storePayload(liveDocument(GOOD)))
    expect(api.storeDocument).toHaveBeenCalledTimes(3)
    expect(api.storeDocument.mock.calls[2][2].editors).toEqual(["ana"])
  })

  it("throws once the retries are used up, so Hocuspocus keeps the document in memory", async () => {
    const { api, hooks } = setup([0, 0])
    api.storeDocument.mockRejectedValue(apiError("unavailable"))
    await changeBy(hooks, "ana")
    const document = liveDocument(GOOD)
    await expect(
      hooks.onStoreDocument(storePayload(document))
    ).rejects.toBeInstanceOf(CollabApiError)
    expect(api.storeDocument).toHaveBeenCalledTimes(3)
    api.storeDocument.mockResolvedValue(undefined)
    await hooks.onStoreDocument(storePayload(document))
    expect(api.storeDocument.mock.calls[3][2].editors).toEqual(["ana"])
  })

  it("does not retry a denial from the API", async () => {
    const { api, hooks } = setup()
    api.storeDocument.mockRejectedValue(apiError("unauthorized", 401))
    await expect(
      hooks.onStoreDocument(storePayload(liveDocument(GOOD)))
    ).rejects.toBeInstanceOf(CollabApiError)
    expect(api.storeDocument).toHaveBeenCalledTimes(1)
  })

  describe("when the page was deleted (404)", () => {
    it("closes every session with a reason and never calls the API about it again", async () => {
      const { api, hooks } = setup()
      api.storeDocument.mockRejectedValue(apiError("not_found", 404))
      const [a, b] = [connection("ana"), connection("ben")]
      const document = liveDocument(GOOD, [a, b])
      await hooks.onStoreDocument(storePayload(document, a))
      for (const c of [a, b])
        expect(c.close).toHaveBeenCalledWith({
          code: 4404,
          reason: "document-deleted",
        })

      await hooks.onStoreDocument(storePayload(document, a))
      expect(api.storeDocument).toHaveBeenCalledTimes(1)
    })
  })

  describe.each([
    [
      "the API says the content is invalid (422)",
      { kind: "invalid" as const, status: 422 },
      4422,
      "invalid-content",
    ],
    [
      "the document is too large (413)",
      { kind: "too_large" as const, status: 413 },
      4413,
      "document-too-large",
    ],
  ])("when %s", (_name, error, code, reason) => {
    it("closes the author, goes back to the last good content and does not retry", async () => {
      const { api, hooks, log } = setup()
      api.storeDocument.mockRejectedValue(apiError(error.kind, error.status))
      api.loadDocument.mockResolvedValue({
        ydoc: encodeState(fieldsToYdoc(GOOD)),
        revision: 2,
        fields: GOOD,
      })
      const [author, other] = [connection("mallory"), connection("ana")]
      const document = liveDocument(fields("bad text", "Bad"), [author, other])

      await hooks.onStoreDocument(storePayload(document, author))

      expect(author.close).toHaveBeenCalledWith({ code, reason })
      expect(other.close).not.toHaveBeenCalled()
      expect(api.storeDocument).toHaveBeenCalledTimes(1)
      expect(ydocToFields(document).title).toBe("Good title")
      expect(log).toHaveBeenCalledWith(
        "changes-rejected",
        expect.objectContaining({
          documentName: NAME,
          reason,
          userId: "mallory",
        })
      )
    })
  })

  describe("when concurrent edits left an empty list in the live document", () => {
    const withEmptyList = () => {
      const document = liveDocument(GOOD)
      document.getXmlFragment("body").push([new Y.XmlElement("bulletList")])
      return document
    }

    it("repairs it, cleans the live document and sends the repaired fields and state", async () => {
      const { api, hooks, log } = setup()
      api.storeDocument.mockResolvedValue(undefined)
      const document = withEmptyList()
      expect(() => ydocToFields(document)).toThrow(InvalidContentError)

      await hooks.onStoreDocument(storePayload(document))

      expect(api.storeDocument).toHaveBeenCalledTimes(1)
      const [, , input] = api.storeDocument.mock.calls[0]
      expect(input.fields).toEqual(ydocToFields(fieldsToYdoc(GOOD)))
      expect(ydocToFields(decodeState(input.ydoc))).toEqual(input.fields)
      expect(
        Buffer.from(input.ydoc).equals(Buffer.from(encodeState(document)))
      ).toBe(true)
      expect(ydocToFields(document)).toEqual(input.fields)
      expect(log).toHaveBeenCalledWith("structure-repaired", {
        documentName: NAME,
      })
      expect(api.loadDocument).not.toHaveBeenCalled()
    })

    it("does not repair again, and does not loop, on the save the write-back triggers", async () => {
      const { api, hooks, log } = setup()
      api.storeDocument.mockResolvedValue(undefined)
      const document = withEmptyList()
      await hooks.onStoreDocument(storePayload(document))
      await hooks.onStoreDocument(storePayload(document))

      expect(api.storeDocument).toHaveBeenCalledTimes(2)
      expect(
        log.mock.calls.filter(([event]) => event === "structure-repaired")
      ).toHaveLength(1)
      expect(api.storeDocument.mock.calls[1][2].fields).toEqual(
        api.storeDocument.mock.calls[0][2].fields
      )
      expect(ydocToRepairedFields(document).repaired).toBe(false)
    })

    it("tells every connected copy: the write-back is an update they receive", async () => {
      const { api, hooks } = setup()
      api.storeDocument.mockResolvedValue(undefined)
      const document = withEmptyList()
      const other = decodeState(encodeState(document))
      document.on("update", (update: Uint8Array) =>
        Y.applyUpdate(other, update)
      )
      await hooks.onStoreDocument(storePayload(document))
      expect(ydocToFields(other)).toEqual(ydocToFields(document))
    })
  })

  describe("when the live document itself is not valid", () => {
    it("never sends it to the API: closes the author and goes back to the last good content", async () => {
      const { api, hooks } = setup()
      api.loadDocument.mockResolvedValue({
        ydoc: encodeState(fieldsToYdoc(GOOD)),
        revision: 2,
        fields: GOOD,
      })
      const author = connection("mallory")
      const document = liveDocument(GOOD, [author])
      document.getXmlFragment("body").push([new Y.XmlElement("unknownNode")])

      await hooks.onStoreDocument(storePayload(document, author))

      expect(api.storeDocument).not.toHaveBeenCalled()
      expect(author.close).toHaveBeenCalledWith({
        code: 4422,
        reason: "invalid-content",
      })
      expect(ydocToFields(document)).toEqual(ydocToFields(fieldsToYdoc(GOOD)))
    })

    it("still goes back to the last good content when the change came from the server itself", async () => {
      const { api, hooks } = setup()
      api.loadDocument.mockResolvedValue({
        ydoc: null,
        revision: 0,
        fields: GOOD,
      })
      const document = liveDocument(GOOD)
      document.getXmlFragment("body").push([new Y.XmlElement("unknownNode")])
      await hooks.onStoreDocument(storePayload(document))
      expect(api.storeDocument).not.toHaveBeenCalled()
      expect(ydocToFields(document)).toEqual(ydocToFields(fieldsToYdoc(GOOD)))
    })

    it("throws when the last good content cannot be loaded, leaving the document for the next attempt", async () => {
      const { api, hooks } = setup()
      api.loadDocument.mockRejectedValue(apiError("unavailable"))
      const document = liveDocument(GOOD)
      document.getXmlFragment("body").push([new Y.XmlElement("unknownNode")])
      await expect(
        hooks.onStoreDocument(storePayload(document))
      ).rejects.toBeInstanceOf(CollabApiError)
    })
  })
})
