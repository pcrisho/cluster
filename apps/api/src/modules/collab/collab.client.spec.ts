import { ServiceUnavailableException } from "@nestjs/common"
import { CollabClient } from "./collab.client"
import { CollabConfig } from "./collab.config"

describe("CollabClient", () => {
  const client = new CollabClient(new CollabConfig())
  const previous = { url: process.env.COLLAB_URL, secret: process.env.COLLAB_INTERNAL_SECRET }
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    process.env.COLLAB_URL = "http://collab.test"
    process.env.COLLAB_INTERNAL_SECRET = "s3cret"
    fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
  })
  afterEach(() => {
    fetchMock.mockRestore()
    for (const [key, value] of [["COLLAB_URL", previous.url], ["COLLAB_INTERNAL_SECRET", previous.secret]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("posts the scope to /control/recheck with the secret", async () => {
    await client.recheck({ scope: "user", id: "u1" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("http://collab.test/control/recheck")
    expect(init.method).toBe("POST")
    expect(init.headers["X-Collab-Secret"]).toBe("s3cret")
    expect(JSON.parse(init.body)).toEqual({ scope: "user", id: "u1" })
  })

  it("rejects when collab answers with an error, so bestEffort can log it", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }))
    await expect(client.close("know.page:x")).rejects.toThrow("401")
  })

  it("rejects without sending anything when the secret is not set", async () => {
    delete process.env.COLLAB_INTERNAL_SECRET
    await expect(client.recheck({ scope: "all" })).rejects.toThrow("COLLAB_INTERNAL_SECRET")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("flush and replace turn any failure into 503", async () => {
    for (const call of [() => client.flush("know.page:x"), () => client.replace("know.page:x", {})]) {
      fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"))
      await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException)
      fetchMock.mockResolvedValue(new Response("{}", { status: 404 }))
      await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException)
    }
  })

  it("flush posts the document name to /control/flush", async () => {
    await client.flush("know.page:x")
    expect(fetchMock.mock.calls[0][0]).toBe("http://collab.test/control/flush")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ documentName: "know.page:x" })
  })
})
