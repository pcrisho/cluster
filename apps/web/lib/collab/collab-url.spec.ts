import { documentName, getCollabUrl } from "./collab-url"

describe("getCollabUrl", () => {
  const original = process.env.NEXT_PUBLIC_COLLAB_URL

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_COLLAB_URL
    else process.env.NEXT_PUBLIC_COLLAB_URL = original
  })

  it("defaults to the local collab service", () => {
    delete process.env.NEXT_PUBLIC_COLLAB_URL
    expect(getCollabUrl()).toBe("ws://localhost:3002")
  })

  it("uses NEXT_PUBLIC_COLLAB_URL when set", () => {
    process.env.NEXT_PUBLIC_COLLAB_URL = "wss://collab.example.com"
    expect(getCollabUrl()).toBe("wss://collab.example.com")
  })
})

describe("documentName", () => {
  it("joins kind and id with a colon", () => {
    expect(documentName("know.page", "abc-123")).toBe("know.page:abc-123")
  })
})
