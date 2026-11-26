/** The web keeps no refresh token: it refreshes from the httpOnly cookie, and only when a session should exist. */
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
})
const fetchMock = jest.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

import {
  clearTokens,
  getFreshAccessToken,
  hasSessionHint,
  setTokens,
} from "./api"

const response = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

beforeEach(() => {
  store.clear()
  fetchMock.mockReset()
  clearTokens()
})

it("does not call the API when no session should exist", async () => {
  expect(await getFreshAccessToken()).toBe("")
  expect(fetchMock).not.toHaveBeenCalled()
})

it("refreshes from the cookie: no token in the body, credentials included", async () => {
  setTokens({ accessToken: "expired.x.y" })
  fetchMock.mockResolvedValue(response(200, { accessToken: "a.b.c", user: {} }))
  expect(await getFreshAccessToken()).toBe("a.b.c")
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toMatch(/\/auth\/refresh$/)
  expect(init).toEqual({ method: "POST", credentials: "include" })
  expect(hasSessionHint()).toBe(true)
})

it("forgets the session when the API says it has ended, and keeps it on a server hiccup", async () => {
  setTokens({ accessToken: "expired.x.y" })
  fetchMock.mockResolvedValueOnce(response(503))
  expect(await getFreshAccessToken()).toBe("")
  expect(hasSessionHint()).toBe(true)

  fetchMock.mockResolvedValueOnce(response(401))
  expect(await getFreshAccessToken()).toBe("")
  expect(hasSessionHint()).toBe(false)
})

it("removes a refresh token an older build left in the page", () => {
  store.set("refreshToken", "legacy")
  clearTokens()
  expect(store.has("refreshToken")).toBe(false)
})
