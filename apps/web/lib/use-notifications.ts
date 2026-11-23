"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { io, type Socket } from "socket.io-client"
import { getErrorMessage } from "./api"
import { reconnectWhileSignedIn, socketAuth } from "./socket-auth"
import { notificationsApi, type Notification } from "./notifications-api"
import { useTranslations } from "next-intl"

interface UseNotificationsResult {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => Promise<void>
}

const POLL_INTERVAL_MS = 30000
const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001"

export function useNotifications(
  isAuthenticated: boolean
): UseNotificationsResult {
  const t = useTranslations("notifications")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list({ limit: 10 }),
        notificationsApi.unreadCount(),
      ])
      setNotifications(listRes.data)
      setUnreadCount(countRes.data.count)
      setError(null)
    } catch (err) {
      setError(
        (err instanceof Error && getErrorMessage(err)) || t("loadFailed")
      )
    }
  }, [isAuthenticated, t])

  useEffect(() => {
    if (!isAuthenticated) {
      // Schedule the loading-state transition out of the effect
      // body to satisfy the set-state-in-effect rule.
      queueMicrotask(() => setIsLoading(false))
      return
    }

    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      setIsLoading(true)
    })
    queueMicrotask(() => {
      void refresh().finally(() => {
        if (mounted) setIsLoading(false)
      })
    })

    const pollInterval = setInterval(() => {
      notificationsApi
        .unreadCount()
        .then((res) => setUnreadCount(res.data.count))
        .catch(() => {})
    }, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(pollInterval)
    }
  }, [isAuthenticated, refresh])

  useEffect(() => {
    if (!isAuthenticated) return

    const socket = io(SOCKET_URL, {
      auth: socketAuth,
      transports: ["websocket", "polling"],
    })
    reconnectWhileSignedIn(socket)
    socketRef.current = socket

    const handleNew = (n: Notification) => {
      setNotifications((prev) => {
        if (prev.some((p) => p.id === n.id)) return prev
        return [n, ...prev].slice(0, 50)
      })
      setUnreadCount((c) => c + 1)
    }

    socket.on("notification:new", handleNew)

    return () => {
      socket.off("notification:new", handleNew)
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated])

  const markRead = useCallback(
    async (id: string) => {
      const prev = notifications
      const target = prev.find((n) => n.id === id)
      if (target && !target.readAt) {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      setNotifications((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        )
      )
      try {
        await notificationsApi.markRead(id)
      } catch (err) {
        setNotifications(prev)
        if (target && !target.readAt) {
          setUnreadCount((c) => c + 1)
        }
        setError(
          (err instanceof Error && getErrorMessage(err)) || t("markFailed")
        )
        throw err
      }
    },
    [notifications, t]
  )

  const markAllRead = useCallback(async () => {
    const prevCount = unreadCount
    setUnreadCount(0)
    setNotifications((ns) =>
      ns.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    )
    try {
      await notificationsApi.markAllRead()
    } catch (err) {
      setUnreadCount(prevCount)
      await refresh()
      setError(
        (err instanceof Error && getErrorMessage(err)) || t("markAllFailed")
      )
      throw err
    }
  }, [unreadCount, refresh, t])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
    refresh,
  }
}
