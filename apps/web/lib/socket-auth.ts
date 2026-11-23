import type { Socket } from "socket.io-client"
import { forceRefresh, getFreshAccessToken } from "@/lib/api"

/** socket.io `auth` option: every (re)connection sends a fresh access token. */
export function socketAuth(cb: (data: object) => void) {
  void getFreshAccessToken().then((token) => cb({ token }))
}

/**
 * The server closes a socket when its access token expires or its session ends. Refresh, and
 * reconnect only if the session is still alive (a revoked one fails the refresh: no loop).
 */
export function reconnectWhileSignedIn(socket: Socket) {
  socket.on("disconnect", (reason) => {
    if (reason !== "io server disconnect") return
    void forceRefresh().then((token) => {
      if (token) socket.connect()
    })
  })
}
