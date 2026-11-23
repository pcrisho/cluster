"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"

import { connectApi, type Liker, type Post } from "@/lib/connect-api"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FeedSkeleton } from "@/components/connect/feed-skeleton"
import { PostCard } from "@/components/connect/post-card"
import { FeedEmpty } from "@/components/connect/feed-empty"
import { FeedError } from "@/components/connect/feed-error"
import { FeedLayout } from "@/components/connect/feed-layout"
import { PostComposerCard } from "@/components/connect/post-composer-card"
import { CelebrationsBanner } from "@/components/connect/celebrations-banner"
import { BackToTop } from "@/components/connect/back-to-top"
import { SortDropdown } from "@/components/connect/sort-dropdown"
import { useFeedSocket } from "@/hooks/use-feed-socket"
import { useTranslations } from "next-intl"

export default function FeedPage() {
  const t = useTranslations("connect.feed")
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [sort, setSort] = useState<"top" | "recent">("top")
  const [newPostsCount, setNewPostsCount] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPosts = useCallback(
    (cursorValue?: string, sortValue?: "top" | "recent") => {
      return connectApi.getFeed(cursorValue, 20, sortValue ?? sort)
    },
    [sort]
  )

  const loadInitialPosts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setNewPostsCount(0)

    try {
      const result = await fetchPosts(undefined, sort)
      setPosts(result.data)
      setCursor(result.meta.cursor)
      setHasMore(!!result.meta.cursor)
    } catch {
      setError(t("loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [fetchPosts, sort, t])

  useEffect(() => {
    Promise.resolve().then(() => loadInitialPosts())
  }, [loadInitialPosts])

  const loadMorePosts = useCallback(async () => {
    if (isLoadingMore || !hasMore || !cursor) return
    setIsLoadingMore(true)

    try {
      const result = await fetchPosts(cursor)
      setPosts((prev) => [...prev, ...result.data])
      setCursor(result.meta.cursor)
      setHasMore(!!result.meta.cursor)
    } catch {
      toast.error(t("loadMoreFailed"))
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, cursor, fetchPosts, t])

  useEffect(() => {
    if (isLoading || !sentinelRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMorePosts()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [isLoading, hasMore, isLoadingMore, loadMorePosts])

  const handlePostCreated = useCallback(() => {
    loadInitialPosts()
  }, [loadInitialPosts])

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }, [])

  const handleSortChange = useCallback((newSort: "top" | "recent") => {
    setSort(newSort)
  }, [])

  // WebSocket live updates
  useFeedSocket({
    onPostCreated: useCallback(
      (data: { authorId: string }) => {
        // Own posts already reload the list in handlePostCreated
        if (data.authorId === user?.id) return
        setNewPostsCount((n) => n + 1)
      },
      [user?.id]
    ),
    onPostLiked: useCallback(
      (data: {
        postId: string
        userId: string
        liked: boolean
        likesCount: number
        recentLikers: Liker[]
      }) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === data.postId
              ? {
                  ...p,
                  _count: { ...p._count, likes: data.likesCount },
                  recentLikers: data.recentLikers,
                }
              : p
          )
        )
      },
      []
    ),
    onCommentCreated: useCallback(
      (data: { postId: string; commentId: string; authorId: string }) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === data.postId
              ? {
                  ...p,
                  _count: { ...p._count, comments: p._count.comments + 1 },
                }
              : p
          )
        )
      },
      []
    ),
  })

  return isLoading ? (
    <FeedSkeleton />
  ) : (
    <FeedLayout>
      <div className="space-y-6">
        <PostComposerCard onPostCreated={handlePostCreated} />
        <CelebrationsBanner />

        {newPostsCount > 0 && (
          <div role="status" aria-live="polite">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={loadInitialPosts}
            >
              {t("newPosts", { count: newPostsCount })}
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <SortDropdown sort={sort} onSortChange={handleSortChange} />
        </div>

        {error && <FeedError message={error} onRetry={loadInitialPosts} />}

        {!error && posts.length === 0 && <FeedEmpty />}

        {!error && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDeleted={handlePostDeleted}
                onUpdated={loadInitialPosts}
              />
            ))}

            <div ref={sentinelRef} className="flex justify-center py-4">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  {t("loadingMore")}
                </div>
              )}
              {!hasMore && posts.length > 0 && (
                <p className="text-sm text-muted-foreground">{t("end")}</p>
              )}
            </div>
          </div>
        )}
        <BackToTop />
      </div>
    </FeedLayout>
  )
}
