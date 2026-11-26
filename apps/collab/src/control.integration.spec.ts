import { CollabApiError } from "./api-client"
import { decodeState, ydocToFields } from "./convert"
import { createFakeApi } from "./testing/fake-api"
import {
  SECRET,
  createHarness,
  fields,
  normalized,
  session,
  settle,
  until,
} from "./testing/harness"

const api = createFakeApi()
// A long debounce: nothing is saved unless a test asks for it (flush) or the document is replaced.
const h = createHarness(api, { debounceMs: 60000, maxDebounceMs: 120000 })

const connect = h.connect

const resetSessions = () => {
  for (const key of Object.keys(api.sessions)) delete api.sessions[key]
  api.sessions.ana = session("ana", "Ana", "WRITE", "#e6194b")
  api.sessions.ben = session("ben", "Ben", "WRITE", "#3cb44b")
  api.sessions.rita = session("rita", "Rita", "READ", "#4363d8")
  api.rechecks.length = 0
}

beforeAll(() => h.start())
beforeEach(() => {
  h.newPage()
  resetSessions()
})
afterEach(() => h.disconnectAll())
afterAll(() => h.stop())

const control = (
  path: string,
  body: unknown,
  headers: Record<string, string> = { "X-Collab-Secret": SECRET }
) =>
  fetch(`${h.url.replace("ws://", "http://")}/control/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })

const accessChanged = (events: { stateless: string[] }) =>
  events.stateless.map((payload) => JSON.parse(payload)).filter((m) => m.type === "access-changed")

describe("POST /control/recheck", () => {
  it("answers 401 without the secret or with a wrong one, and 400 for a malformed request", async () => {
    const body = { scope: "all" }
    expect((await control("recheck", body, {})).status).toBe(401)
    expect((await control("recheck", body, { "X-Collab-Secret": "nope" })).status).toBe(401)
    expect((await control("recheck", { scope: "galaxy" })).status).toBe(400)
    expect((await control("recheck", { scope: "user" })).status).toBe(400)
  })

  it("downgrades a writer to a reader: tells them and ignores what they send afterwards", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    api.sessions.ana.mode = "READ"

    expect((await control("recheck", { scope: "user", id: "ana" })).status).toBe(202)
    await until(() => accessChanged(ana.events).length === 1, "the access-changed message")
    expect(accessChanged(ana.events)[0]).toMatchObject({ mode: "READ" })
    expect(accessChanged(ben.events)).toHaveLength(0)

    ana.ydoc.getText("t").insert(0, "after the downgrade")
    ben.ydoc.getText("t").insert(0, "still writing")
    await until(() => ana.ydoc.getText("t").toString().includes("still writing"), "ben's edit to reach ana")
    expect(ben.ydoc.getText("t").toString()).not.toContain("after the downgrade")
  })

  it("stops relaying the cursor of someone downgraded to a reader", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    const cursorOfAna = () =>
      [...ben.provider.awareness!.getStates().values()].find(
        (state) => state.user?.userId === "ana"
      )?.cursor
    const cursor = (n: number) => ({ anchor: { type: 1, n }, head: { type: 1, n } })

    ana.provider.awareness!.setLocalStateField("cursor", cursor(1))
    await until(() => cursorOfAna()?.anchor.n === 1, "ben to see ana's cursor")

    api.sessions.ana.mode = "READ"
    await control("recheck", { scope: "user", id: "ana" })
    await until(() => accessChanged(ana.events).length === 1, "the access-changed message")
    ana.provider.awareness!.setLocalStateField("cursor", cursor(2))
    await settle()
    expect(cursorOfAna()?.anchor?.n).not.toBe(2)
  })

  it("promotes a reader who gained write access", async () => {
    const ana = connect("ana")
    const rita = connect("rita")
    await until(() => ana.events.synced && rita.events.synced, "both to sync")
    api.sessions.rita.mode = "WRITE"

    await control("recheck", { scope: "page", id: h.page.split(":")[1] })
    await until(() => accessChanged(rita.events).length === 1, "the access-changed message")
    expect(accessChanged(rita.events)[0]).toMatchObject({ mode: "WRITE" })

    rita.ydoc.getText("t").insert(0, "now I can")
    await until(() => ana.ydoc.getText("t").toString() === "now I can", "rita's edit to reach ana")
  })

  it("closes the session of someone who lost access and leaves the others alone", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    api.denied.add("ben")

    await control("recheck", { scope: "all" })
    await until(() => ben.events.closes.includes("access-revoked"), "ben's session to close")
    expect(ana.events.closes).not.toContain("access-revoked")
    expect(accessChanged(ana.events)).toHaveLength(0)
    expect(h.server.hocuspocus.documents.get(h.page)!.getConnectionsCount()).toBe(1)
  })

  it("checks only the connections of the scope", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    api.rechecks.length = 0

    await control("recheck", { scope: "user", id: "ben" })
    await until(() => api.rechecks.length > 0, "the recheck")
    await settle()
    expect(api.rechecks).toEqual([{ userId: "ben", documentName: h.page }])

    api.rechecks.length = 0
    await control("recheck", { scope: "page", id: "00000000-0000-4000-8000-000000000000" })
    await settle()
    expect(api.rechecks).toEqual([])
  })

  it("keeps everyone connected when the API cannot answer", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    api.state.down = true

    await control("recheck", { scope: "all" })
    await settle()
    expect(ana.events.closes).toEqual([])
    expect(h.server.hocuspocus.documents.get(h.page)!.getConnectionsCount()).toBe(1)
  })
})

describe("token refresh on a live session", () => {
  it("downgrades the session when the new token carries read access", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    api.sessions.ana.mode = "READ"

    await ana.provider.sendToken()
    await until(() => accessChanged(ana.events).length === 1, "the access-changed message")
    expect(accessChanged(ana.events)[0]).toMatchObject({ mode: "READ" })
  })

  it("closes the session when the new token is no longer accepted", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    delete api.sessions.ana

    await ana.provider.sendToken()
    await until(() => ana.events.closes.length > 0, "the session to close")
    expect(ana.events.closes.at(-1)).toBe("access-revoked")
  })

  it("keeps the session when the API is down at the moment of the refresh", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    api.state.down = true

    await ana.provider.sendToken()
    await settle()
    expect(ana.events.closes).toEqual([])
  })
})

describe("POST /control/close", () => {
  it("closes every session with the deleted reason and never saves the document", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")
    ana.ydoc.getText("t").insert(0, "unsaved")
    await until(() => ben.ydoc.getText("t").toString() === "unsaved", "the edit to arrive")

    expect((await control("close", { documentName: h.page })).status).toBe(200)
    await until(
      () => ana.events.closes.includes("document-deleted") && ben.events.closes.includes("document-deleted"),
      "both sessions to close"
    )
    // Saves that were waiting out their debounce run now; a discarded document must not be saved.
    h.server.hocuspocus.flushPendingStores()
    await settle()
    expect(api.stored).toEqual([])
  })

  it("answers 400 for a malformed document name and 200 when the document is not open", async () => {
    expect((await control("close", { documentName: "not a name" })).status).toBe(400)
    expect((await control("close", { documentName: h.page })).status).toBe(200)
  })
})

describe("POST /control/flush", () => {
  it("saves the live document now and answers once the API has it", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    ana.ydoc.getText("t").insert(0, "typed a moment ago")
    await settle()
    expect(api.stored).toHaveLength(0)

    expect((await control("flush", { documentName: h.page })).status).toBe(200)
    expect(api.stored).toHaveLength(1)
  })

  it("does nothing, successfully, when the document is not open", async () => {
    expect((await control("flush", { documentName: h.page })).status).toBe(200)
    expect(api.stored).toHaveLength(0)
  })

  it("answers 503 when the API cannot take the save", async () => {
    const ana = connect("ana")
    await until(() => ana.events.synced, "ana to sync")
    ana.ydoc.getText("t").insert(0, "x")
    const down = () => new CollabApiError("unavailable", undefined, "down")
    api.state.storeErrors.push(down(), down(), down())

    expect((await control("flush", { documentName: h.page })).status).toBe(503)
  })
})

describe("POST /control/replace", () => {
  const newBody = fields("restored text").body

  it("replaces the body for everyone connected and answers once it is saved", async () => {
    const ana = connect("ana")
    const ben = connect("ben")
    await until(() => ana.events.synced && ben.events.synced, "both to sync")

    const response = await control("replace", { documentName: h.page, body: newBody })
    expect(response.status).toBe(200)

    expect(api.stored.at(-1)!.fields.body).toEqual(normalized(fields("restored text")).body)
    await until(
      () => JSON.stringify(ydocToFields(ben.ydoc).body) === JSON.stringify(normalized(fields("restored text")).body),
      "ben to see the restored body"
    )
    // The title is not part of a restore.
    expect(api.stored.at(-1)!.fields.title).toBe("Page title")
    expect(decodeState(api.stored.at(-1)!.ydoc)).toBeDefined()
  })

  it("works on a page nobody has open", async () => {
    expect((await control("replace", { documentName: h.page, body: newBody })).status).toBe(200)
    expect(api.stored.at(-1)!.fields.body).toEqual(normalized(fields("restored text")).body)
  })

  it("answers 404 for a page that does not exist, 422 for a body the schema rejects and 400 for a malformed request", async () => {
    const missing = "know.page:00000000-0000-4000-8000-000000000000"
    expect((await control("replace", { documentName: missing, body: newBody })).status).toBe(404)
    const bad = { type: "doc", content: [{ type: "scriptNode" }] }
    expect((await control("replace", { documentName: h.page, body: bad })).status).toBe(422)
    expect((await control("replace", { documentName: h.page })).status).toBe(400)
  })
})
