import http from "node:http"
import WebSocket from "ws"
import type { Server } from "@hocuspocus/server"
import type { CollabConfig } from "./config"
import { createCollabServer } from "./server"
import { createFakeApi } from "./testing/fake-api"

const ALLOWED = "http://localhost:3000"
const config: CollabConfig = {
  port: 0,
  secret: "0123456789abcdef",
  allowedOrigins: [ALLOWED],
  apiUrl: "http://localhost:3001/api/v1",
  maxDocBytes: 10485760,
}
const DOCUMENT = "know.page:00000000-0000-0000-0000-000000000000"

let server: Server
let baseUrl: string
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)

const getHealth = () =>
  new Promise<{ status?: number; body: string }>((resolve, reject) => {
    http
      .get(`${baseUrl}/health`, (res) => {
        let body = ""
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => resolve({ status: res.statusCode, body }))
      })
      .on("error", reject)
  })

/** Attempts a WebSocket upgrade with the given Origin and resolves with the outcome. */
const upgrade = (origin: string) =>
  new Promise<{ error?: Error; ws?: WebSocket }>((resolve) => {
    const ws = new WebSocket(baseUrl.replace("http", "ws"), {
      headers: { Origin: origin },
    })
    ws.on("open", () => resolve({ ws }))
    ws.on("error", (error) => resolve({ error }))
  })

beforeAll(async () => {
  process.on("unhandledRejection", onUnhandled)
  server = createCollabServer(config, {
    api: createFakeApi(),
    log: () => {},
  })
  await server.listen()
  baseUrl = `http://127.0.0.1:${server.address.port}`
})

afterAll(async () => {
  await server.destroy()
  process.off("unhandledRejection", onUnhandled)
})

describe("createCollabServer", () => {
  it("answers GET /health with the counters and uptime", async () => {
    const { status, body } = await getHealth()
    expect(status).toBe(200)
    const json = JSON.parse(body)
    expect(typeof json.documents).toBe("number")
    expect(typeof json.connections).toBe("number")
    expect(typeof json.uptime).toBe("number")
  })

  it("refuses an upgrade from a disallowed origin with 403", async () => {
    const { error } = await upgrade("http://evil.test")
    expect(error?.message).toContain("403")
  })

  it("refuses an upgrade without an Origin", async () => {
    const { error } = await upgrade("")
    expect(error?.message).toContain("403")
  })

  it("does not leave an allowed socket authenticated (the API denies it)", async () => {
    const { ws, error } = await upgrade(ALLOWED)
    expect(error).toBeUndefined()
    if (!ws) throw new Error("socket did not open")
    // Document-open frame: name, MessageType.Auth (2), AuthMessageType.Token (0), token.
    // Lengths are single bytes, which holds for these short fixtures.
    const name = Buffer.from(DOCUMENT)
    const token = Buffer.from("x")
    const frame = Buffer.concat([
      Buffer.from([name.length]),
      name,
      Buffer.from([2, 0, token.length]),
      token,
    ])
    const denied = new Promise<Buffer>((resolve) =>
      ws.on("message", (data: Buffer) => resolve(data))
    )
    ws.send(frame)
    const reply = await denied
    // AuthMessageType.PermissionDenied (1) answer with the reason of a denial
    expect(reply.includes("permission-denied")).toBe(true)
    ws.close()
  })

  it("raises no unhandled rejection for the refused and health cases", async () => {
    await upgrade("http://evil.test")
    await getHealth()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(unhandled).toEqual([])
  })
})
