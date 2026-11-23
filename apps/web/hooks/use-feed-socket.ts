"use client"

import { useEffect, useInsertionEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import type { Liker } from "@/lib/connect-api"
import { reconnectWhileSignedIn, socketAuth } from "@/lib/socket-auth"

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001"

interface FeedSocketOptions {
  onPostCreated?: (data: {
    postId: string
    title: string
    authorId: string
    authorName: string
  }) => void
  onPostLiked?: (data: {
    postId: string
    userId: string
    liked: boolean
    likesCount: number
    recentLikers: Liker[]
  }) => void
  onCommentCreated?: (data: {
    postId: string
    commentId: string
    authorId: string
  }) => void
}

export function useFeedSocket(options: FeedSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const optionsRef = useRef(options)
  // Written in an insertion effect, not during render (react-hooks/refs).
  useInsertionEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      // A function so every (re)connection sends a fresh access token.
      auth: socketAuth,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    })

    reconnectWhileSignedIn(socket)
    socketRef.current = socket

    socket.on("connect", () => {
      setIsConnected(true)
    })

    socket.on("disconnect", () => {
      setIsConnected(false)
    })

    socket.on(
      "connect:post:created",
      (data: {
        postId: string
        title: string
        authorId: string
        authorName: string
      }) => {
        optionsRef.current.onPostCreated?.(data)
      }
    )

    socket.on(
      "connect:post:liked",
      (data: {
        postId: string
        userId: string
        liked: boolean
        likesCount: number
        recentLikers: Liker[]
      }) => {
        optionsRef.current.onPostLiked?.(data)
      }
    )

    socket.on(
      "connect:comment:created",
      (data: { postId: string; commentId: string; authorId: string }) => {
        optionsRef.current.onCommentCreated?.(data)
      }
    )

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  return { isConnected }
}
