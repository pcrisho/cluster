import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http"
import type { AddressInfo } from "net"
import * as Y from "yjs"
import { ApiClient, CollabApiError } from "./api-client"

const SECRET = "test-secret-0123456789"
const ID = "0b6f7a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"
const FIELDS = { body: { type: "doc", content: [] }, title: "Hello" }

interface Recorded {
  method: string
  url: string
  secret: string | undefined
  contentType: string | undefined
  body: unknown
}

type Reply = { status: number; json?: unknown }

let server: Server
let baseUrl: string
let recorded: Recorded[]
// Replies are consumed in order; the last one repeats when the queue is empty.
let replies: Reply[]

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      recorded.push({
        method: req.method ?? "",
        url: req.url ?? "",
        secret: req.headers["x-collab-secret"] as string | undefined,
        contentType: req.headers["content-type"],
        body: raw ? JSON.parse(raw) : undefined,
      })
      const reply = replies.length > 1 ? replies.shift()! : replies[0]
      res.writeHead(reply.status, { "Content-Type": "application/json" })
      res.end(reply.json === undefined ? "" : JSON.stringify(reply.json))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api/v1`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  recorded = []
  replies = [{ status: 200, json: {} }]
})

function client(timeoutMs?: number) {
  return new ApiClient({ apiUrl: baseUrl, secret: SECRET, timeoutMs })
}

async function kindOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(CollabApiError)
    return error as CollabApiError
  }
  throw new Error("expected the call to fail")
}

describe("ApiClient requests", () => {
  it("authorize posts the token and document name with the secret header", async () => {
    const session = {
      userId: "u1",
      orgId: "o1",
      name: "Ana",
      avatarUrl: null,
      color: "#fff",
      mode: "WRITE",
    }
    replies = [{ status: 200, json: session }]

    await expect(client().authorize("jwt", `know.page:${ID}`)).resolves.toEqual(
      session
    )
    expect(recorded).toEqual([
      {
        method: "POST",
        url: "/api/v1/internal/collab/authorize",
        secret: SECRET,
        contentType: "application/json",
        body: { token: "jwt", documentName: `know.page:${ID}` },
      },
    ])
  })

  it("authorizeUser posts the user id and document name", async () => {
    await client().authorizeUser("u1", `know.page:${ID}`)
    expect(recorded[0]).toMatchObject({
      method: "POST",
      url: "/api/v1/internal/collab/authorize-user",
      secret: SECRET,
      body: { userId: "u1", documentName: `know.page:${ID}` },
    })
  })

  it("loadDocument decodes the base64 state and encodes kind and id in the path", async () => {
    const doc = new Y.Doc()
    doc.getText("t").insert(0, "state")
    const bytes = Y.encodeStateAsUpdate(doc)
    replies = [
      {
        status: 200,
        json: {
          ydoc: Buffer.from(bytes).toString("base64"),
          revision: 3,
          fields: FIELDS,
        },
      },
    ]

    const loaded = await client().loadDocument("know.page", ID)

    expect(recorded[0]).toMatchObject({
      method: "GET",
      url: `/api/v1/internal/collab/documents/know.page/${ID}`,
      secret: SECRET,
    })
    expect(loaded.ydoc).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(loaded.ydoc!).equals(Buffer.from(bytes))).toBe(true)
    expect(loaded.revision).toBe(3)
    expect(loaded.fields).toEqual(FIELDS)
  })

  it("loadDocument returns a null ydoc when none is stored", async () => {
    replies = [
      { status: 200, json: { ydoc: null, revision: 0, fields: FIELDS } },
    ]
    await expect(client().loadDocument("know.page", ID)).resolves.toEqual({
      ydoc: null,
      revision: 0,
      fields: FIELDS,
    })
  })

  it("seedDocument puts the base64 state to the seed route", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    replies = [{ status: 204 }]

    await client().seedDocument("know.page", ID, bytes)

    expect(recorded[0]).toMatchObject({
      method: "PUT",
      url: `/api/v1/internal/collab/documents/know.page/${ID}/seed`,
      secret: SECRET,
      body: { ydoc: Buffer.from(bytes).toString("base64") },
    })
  })

  it("storeDocument puts the state, fields and editors", async () => {
    const bytes = new Uint8Array([9, 8, 7])
    replies = [{ status: 204 }]

    await client().storeDocument("know.page", ID, {
      ydoc: bytes,
      fields: FIELDS,
      editors: ["u1", "u2"],
    })

    expect(recorded[0]).toMatchObject({
      method: "PUT",
      url: `/api/v1/internal/collab/documents/know.page/${ID}`,
      secret: SECRET,
      body: {
        ydoc: Buffer.from(bytes).toString("base64"),
        fields: FIELDS,
        editors: ["u1", "u2"],
      },
    })
  })

  it("encodes the path segments", async () => {
    replies = [{ status: 204 }]
    await client().storeDocument("know.page", "a/b?c", {
      ydoc: new Uint8Array(),
      fields: FIELDS,
      editors: [],
    })
    expect(recorded[0].url).toBe(
      "/api/v1/internal/collab/documents/know.page/a%2Fb%3Fc"
    )
  })

  it("ydoc state survives the wire round trip", async () => {
    const doc = new Y.Doc()
    doc.getXmlFragment("body").insert(0, [new Y.XmlElement("paragraph")])
    const bytes = Y.encodeStateAsUpdate(doc)
    replies = [
      {
        status: 200,
        json: {
          ydoc: Buffer.from(bytes).toString("base64"),
          revision: 1,
          fields: FIELDS,
        },
      },
    ]
    const loaded = await client().loadDocument("know.page", ID)
    const copy = new Y.Doc()
    Y.applyUpdate(copy, loaded.ydoc!)
    expect(copy.getXmlFragment("body").length).toBe(1)
  })
})

describe("ApiClient errors", () => {
  it.each([
    [400, "bad_request"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [413, "too_large"],
    [422, "invalid"],
  ] as const)("maps %i to %s without retrying", async (status, kind) => {
    replies = [{ status, json: { message: "nope" } }]

    const error = await kindOf(client().loadDocument("know.page", ID))

    expect(error.kind).toBe(kind)
    expect(error.status).toBe(status)
    expect(recorded).toHaveLength(1)
  })

  it("maps a 500 to unavailable after one retry", async () => {
    replies = [{ status: 500 }]

    const error = await kindOf(client().loadDocument("know.page", ID))

    expect(error.kind).toBe("unavailable")
    expect(error.status).toBe(500)
    expect(recorded).toHaveLength(2)
  })

  it("retries once after a 503 and returns the second answer", async () => {
    replies = [
      { status: 503 },
      { status: 200, json: { ydoc: null, revision: 0, fields: FIELDS } },
    ]

    const started = Date.now()
    const loaded = await client().loadDocument("know.page", ID)

    expect(loaded.revision).toBe(0)
    expect(recorded).toHaveLength(2)
    expect(Date.now() - started).toBeGreaterThanOrEqual(150)
  })

  it("does not retry a 404 on a write either", async () => {
    replies = [{ status: 404 }]
    const error = await kindOf(
      client().storeDocument("know.page", ID, {
        ydoc: new Uint8Array(),
        fields: FIELDS,
        editors: [],
      })
    )
    expect(error.kind).toBe("not_found")
    expect(recorded).toHaveLength(1)
  })

  it("maps a request that never answers to unavailable", async () => {
    replies = [{ status: 200, json: {} }]
    const hanging = createServer(() => {})
    await new Promise<void>((resolve) =>
      hanging.listen(0, "127.0.0.1", resolve)
    )
    const { port } = hanging.address() as AddressInfo
    const slow = new ApiClient({
      apiUrl: `http://127.0.0.1:${port}/api/v1`,
      secret: SECRET,
      timeoutMs: 20,
    })

    try {
      const error = await kindOf(slow.loadDocument("know.page", ID))
      expect(error.kind).toBe("unavailable")
      expect(error.status).toBeUndefined()
    } finally {
      hanging.closeAllConnections()
      await new Promise((resolve) => hanging.close(resolve))
    }
  })

  it("maps a refused connection to unavailable", async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve))
    const { port } = closed.address() as AddressInfo
    await new Promise((resolve) => closed.close(resolve))
    const refused = new ApiClient({
      apiUrl: `http://127.0.0.1:${port}/api/v1`,
      secret: SECRET,
    })
    const error = await kindOf(refused.loadDocument("know.page", ID))
    expect(error.kind).toBe("unavailable")
  })
})
