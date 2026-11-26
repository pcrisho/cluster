import type { HocuspocusProvider } from "@hocuspocus/provider"
import * as Y from "yjs"
import { CollabApiError } from "./api-client"
import {
  decodeState,
  fieldsToYdoc,
  replaceFields,
  ydocToFields,
} from "./convert"
import { createFakeApi } from "./testing/fake-api"
import {
  FIELDS,
  createHarness,
  fields,
  normalized,
  paragraph,
  session,
  settle,
  until,
} from "./testing/harness"

/** The fake API: a token says who the person is. */
const api = createFakeApi()
api.sessions.ana = session("ana", "Ana", "WRITE", "#e6194b")
api.sessions.ben = session("ben", "Ben", "WRITE", "#3cb44b")
api.sessions.rita = session("rita", "Rita", "READ", "#4363d8")

const h = createHarness(api)
const connect = h.connect

beforeAll(() => h.start())
beforeEach(() => {
  h.newPage()
})
afterEach(() => h.disconnectAll())
afterAll(() => h.stop())

describe("collab server over real sockets", () => {
  it("syncs the edits of two writers", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    ana.ydoc.getText("t").insert(0, "hello")
    await until(
      () => ben.ydoc.getText("t").toString() === "hello",
      "ben to receive the edit"
    )
    ben.ydoc.getText("t").insert(5, " world")
    await until(
      () => ana.ydoc.getText("t").toString() === "hello world",
      "ana to receive the edit"
    )
  })

  it("ignores everything a reader sends: nobody sees it and the server document is unchanged", async () => {
    const ana = connect("ana")
    const rita = connect("rita")
    await until(() => ana.events.synced && rita.events.synced, "both to sync")
    ana.ydoc.getText("t").insert(0, "legit")
    await until(
      () => rita.ydoc.getText("t").toString() === "legit",
      "rita to receive the edit"
    )

    rita.ydoc.getText("t").insert(0, "TAMPERED ")
    await settle()

    expect(ana.ydoc.getText("t").toString()).toBe("legit")
    const live = h.server.hocuspocus.documents.get(h.page)!
    expect(live.getText("t").toString()).toBe("legit")
  })

  it("rejects an unknown token and an API failure with different reasons", async () => {
    const stranger = connect("nobody")
    await until(() => stranger.events.failed !== undefined, "the rejection")
    expect(stranger.events.failed).toBe("permission-denied")

    api.state.down = true
    const unlucky = connect("ana")
    await until(() => unlucky.events.failed !== undefined, "the rejection")
    expect(unlucky.events.failed).toBe("unavailable")
  })

  describe("presence", () => {
    const peerStates = (viewer: HocuspocusProvider) =>
      [...viewer.awareness!.getStates().entries()].filter(
        ([id]) => id !== viewer.awareness!.clientID
      )

    it("shows the identity the server knows, whatever the client claims, and relays the cursor of writers", async () => {
      const ana = connect("ana")
      const ben = connect("ben")
      await until(() => ana.events.synced && ben.events.synced, "both to sync")
      ana.provider.awareness!.setLocalState({
        user: { name: "Mallory", color: "#000000" },
        cursor: { anchor: { type: 1 }, head: { type: 2 } },
        junk: "x".repeat(5000),
      })
      await until(() => peerStates(ben.provider).length === 1, "ben to see ana")
      const [[, state]] = peerStates(ben.provider)
      expect(state.user).toEqual({
        userId: "ana",
        name: "Ana",
        color: "#e6194b",
        avatarUrl: null,
        mode: "WRITE",
      })
      expect(state.cursor).toEqual({ anchor: { type: 1 }, head: { type: 2 } })
      expect(state).not.toHaveProperty("junk")
    })

    it("lists a reader without a cursor", async () => {
      const ana = connect("ana")
      const rita = connect("rita")
      await until(() => ana.events.synced && rita.events.synced, "both to sync")
      rita.provider.awareness!.setLocalState({
        user: { name: "Rita" },
        cursor: { anchor: { type: 1 }, head: { type: 2 } },
      })
      await until(
        () => peerStates(ana.provider).length === 1,
        "ana to see rita"
      )
      const [[, state]] = peerStates(ana.provider)
      expect(state.user).toEqual({
        userId: "rita",
        name: "Rita",
        color: "#4363d8",
        avatarUrl: null,
        mode: "READ",
      })
      expect(state).not.toHaveProperty("cursor")
    })
  })
  describe("documents", () => {
    it("seeds a page that was never opened exactly once, even with two visitors at the same time", async () => {
      const ana = connect("ana")
      const ben = connect("ben")
      await until(() => ana.events.synced && ben.events.synced, "both to sync")
      expect(api.state.seeds).toBe(1)
      expect(ydocToFields(ana.ydoc)).toEqual(normalized(FIELDS))
      expect(ydocToFields(ben.ydoc)).toEqual(normalized(FIELDS))
      // What was seeded is what the API holds, so the next server to load it serves the same copy.
      const persisted = api.pages.get(h.page)!.ydoc!
      expect(ydocToFields(decodeState(persisted))).toEqual(normalized(FIELDS))
    })

    it("saves what an editor writes once they stop, with the derived fields and who wrote it", async () => {
      const ana = connect("ana")
      await until(() => ana.events.synced, "ana to sync")
      replaceFields(ana.ydoc, fields("written live", "Live title"))
      await until(() => api.stored.length > 0, "the save")
      const saved = api.stored.at(-1)!
      expect(saved.fields).toEqual(
        normalized(fields("written live", "Live title"))
      )
      expect(saved.editors).toEqual(["ana"])
      expect(ydocToFields(decodeState(api.pages.get(h.page)!.ydoc!)).title).toBe(
        "Live title"
      )
    })

    it("does not save, and disconnects the author, when a writer sends content the schema does not allow", async () => {
      const ana = connect("ana")
      const ben = connect("ben")
      await until(() => ana.events.synced && ben.events.synced, "both to sync")

      ana.ydoc.getXmlFragment("body").push([new Y.XmlElement("unknownNode")])
      await until(
        () => ana.events.closes.includes("invalid-content"),
        "ana to be disconnected"
      )
      ana.provider.destroy()

      await until(() => {
        try {
          ydocToFields(ben.ydoc)
          return true
        } catch {
          return false
        }
      }, "ben's document to be valid again")
      expect(ydocToFields(ben.ydoc)).toEqual(normalized(FIELDS))
      expect(
        api.stored.every(
          (call) =>
            JSON.stringify(call.fields).includes("unknownNode") === false
        )
      ).toBe(true)
      expect(ben.events.closes).not.toContain("invalid-content")
    })

    it("repairs the list two writers empty together: nobody is disconnected and the saved content is valid", async () => {
      const list = (...values: string[]) => ({
        type: "bulletList",
        content: values.map((v) => ({
          type: "listItem",
          content: [paragraph(v)],
        })),
      })
      const body = (...values: string[]) => ({
        type: "doc",
        content: [list(...values), paragraph("after")],
      })
      api.pages.set(h.page, {
        ydoc: null,
        revision: 0,
        fields: { body: body("a", "b", "c", "d"), title: "List" },
      })
      const ana = connect("ana")
      const ben = connect("ben")
      await until(() => ana.events.synced && ben.events.synced, "both to sync")

      // Back to back, before either update can travel: each deletes a different half of the list.
      replaceFields(ana.ydoc, { body: body("c", "d"), title: "List" })
      replaceFields(ben.ydoc, { body: body("a", "b"), title: "List" })

      const live = () => h.server.hocuspocus.documents.get(h.page)!
      const valid = (doc: Y.Doc) => {
        try {
          return ydocToFields(doc)
        } catch {
          return undefined
        }
      }
      const settled = () => {
        const [a, b, onServer] = [
          valid(ana.ydoc),
          valid(ben.ydoc),
          valid(live()),
        ]
        return (
          !!a &&
          JSON.stringify(a) === JSON.stringify(b) &&
          JSON.stringify(a) === JSON.stringify(onServer)
        )
      }
      await until(settled, "everyone to hold the same valid document")
      await until(
        () =>
          api.stored.length > 0 &&
          !!valid(decodeState(api.pages.get(h.page)!.ydoc!)),
        "the save"
      )
      await settle()

      const expected = normalized({
        body: { type: "doc", content: [paragraph("after")] },
        title: "List",
      })
      expect(ydocToFields(ana.ydoc)).toEqual(expected)
      expect(ydocToFields(ben.ydoc)).toEqual(expected)
      expect(api.pages.get(h.page)!.fields).toEqual(expected)
      expect(ydocToFields(decodeState(api.pages.get(h.page)!.ydoc!))).toEqual(
        expected
      )
      expect(JSON.stringify(api.pages.get(h.page)!.fields)).not.toContain(
        "bulletList"
      )
      expect(ana.events.closes).toEqual([])
      expect(ben.events.closes).toEqual([])
    })

    it("closes every session when the page was deleted", async () => {
      const ana = connect("ana")
      const ben = connect("ben")
      await until(() => ana.events.synced && ben.events.synced, "both to sync")
      api.pages.delete(h.page)
      replaceFields(ana.ydoc, fields("typed into a deleted page"))
      await until(
        () =>
          ana.events.closes.includes("document-deleted") &&
          ben.events.closes.includes("document-deleted"),
        "both to be closed"
      )
      expect(api.stored).toHaveLength(0)
    })

    it("keeps trying while the API is unavailable and saves when it recovers", async () => {
      const ana = connect("ana")
      await until(() => ana.events.synced, "ana to sync")
      api.state.storeErrors.push(
        new CollabApiError("unavailable", undefined, "down"),
        new CollabApiError("unavailable", undefined, "down")
      )
      replaceFields(ana.ydoc, fields("survives an outage"))
      await until(() => api.stored.length > 0, "the save after the outage")
      expect(api.stored.at(-1)!.fields).toEqual(
        normalized(fields("survives an outage"))
      )
    })

    it("does not open a page whose stored content the schema rejects", async () => {
      api.pages.set(h.page, {
        ydoc: null,
        revision: 0,
        fields: {
          body: { type: "doc", content: [{ type: "scriptNode" }] },
          title: "x",
        },
      })
      const ana = connect("ana")
      await until(
        () => ana.events.failed !== undefined || ana.events.closes.length > 0,
        "the refusal"
      )
      expect(ana.events.synced).toBe(false)
      expect(api.state.seeds).toBe(0)
    })
  })
})
