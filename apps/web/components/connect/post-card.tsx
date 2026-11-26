"use client"

import { useState, useCallback } from "react"
import {
  HeartIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { connectApi, type Post } from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PostBody } from "@/components/connect/post-body"
import { PostDetailDialog } from "@/components/connect/post-detail-dialog"
import { PostDialog } from "@/components/connect/post-dialog"
import { PostImages } from "@/components/connect/post-images"
import { InlineComments } from "@/components/connect/inline-comments"
import { ReactionAvatars } from "@/components/connect/reaction-avatars"
import { withMyLike } from "@/components/connect/reactions"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

interface PostCardProps {
  post: Post
  onDeleted: (postId: string) => void
  onUpdated: () => void
}

export function PostCard({ post, onDeleted, onUpdated }: PostCardProps) {
  const t = useTranslations("connect.post")
  const dates = useDates()
  const { user } = useAuth()
  const [liked, setLiked] = useState(post.likedByMe)
  const [likesCount, setLikesCount] = useState(post._count.likes)
  const [isLikeAnimating, setIsLikeAnimating] = useState(false)
  const [isCommentsExpanded, setIsCommentsExpanded] = useState(false)
  const [commentsCount, setCommentsCount] = useState(post._count.comments)

  // Live counts arrive through the post prop (feed socket). Adjusting state
  // during render keeps the optimistic local value until the prop changes.
  const [seenLikes, setSeenLikes] = useState(post._count.likes)
  if (post._count.likes !== seenLikes) {
    setSeenLikes(post._count.likes)
    setLikesCount(post._count.likes)
  }
  // The people the count names travel with it, or the line says "and 1 more" with nobody before it.
  const [likers, setLikers] = useState(post.recentLikers)
  const [seenLikers, setSeenLikers] = useState(post.recentLikers)
  if (post.recentLikers !== seenLikers) {
    setSeenLikers(post.recentLikers)
    setLikers(post.recentLikers)
  }
  const [seenComments, setSeenComments] = useState(post._count.comments)
  if (post._count.comments !== seenComments) {
    setSeenComments(post._count.comments)
    setCommentsCount(post._count.comments)
  }

  const canDelete = () => {
    if (!user) return false
    return post.authorId === user.id || user.role === "ADMIN"
  }

  const handleLike = useCallback(async () => {
    const previousLiked = liked
    const previousCount = likesCount
    const previousLikers = likers

    setLiked(!liked)
    setLikesCount(liked ? likesCount - 1 : likesCount + 1)
    if (user) {
      setLikers(
        withMyLike(
          likers,
          {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl ?? null,
          },
          !liked
        )
      )
    }
    setIsLikeAnimating(true)
    setTimeout(() => setIsLikeAnimating(false), 400)

    try {
      const result = await connectApi.toggleLike(post.id)
      setLiked(result.data.liked)
      setLikesCount(result.data.likesCount)
      setLikers(result.data.recentLikers)
    } catch {
      setLiked(previousLiked)
      setLikesCount(previousCount)
      setLikers(previousLikers)
      toast.error(t("likeFailed"))
    }
  }, [liked, likesCount, likers, user, post.id, t])

  const handleCommentCountChanged = useCallback(
    (_postId: string, count: number) => {
      setCommentsCount(count)
    },
    []
  )

  const handleDelete = useCallback(async () => {
    try {
      await connectApi.deletePost(post.id)
      onDeleted(post.id)
      toast.success(t("deleted"))
    } catch {
      toast.error(t("deleteFailed"))
    }
  }, [post.id, onDeleted, t])

  return (
    <Card
      className={cn(
        "animate-in duration-300 fade-in slide-in-from-top-2",
        post.isPinned && "ring-primary/30"
      )}
    >
      <CardContent>
        <article>
          {post.isPinned && (
            <Badge variant="secondary" className="mb-3">
              <MegaphoneIcon data-icon="inline-start" />
              {t("announcement")}
            </Badge>
          )}

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                {post.author.avatarUrl && (
                  <AvatarImage
                    src={getImageUrl(post.author.avatarUrl) || undefined}
                    alt={`${post.author.firstName} ${post.author.lastName}`}
                  />
                )}
                <AvatarFallback className="text-sm">
                  {post.author.firstName[0]}
                  {post.author.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm leading-tight font-medium">
                  {post.author.firstName} {post.author.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dates.relative(post.createdAt)}
                </p>
              </div>
            </div>

            {canDelete() && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("actions")}
                    className="text-muted-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover/card:opacity-100"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <PostDialog post={post} onPostSaved={onUpdated}>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <PencilIcon className="size-3" />
                      {t("edit")}
                    </DropdownMenuItem>
                  </PostDialog>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash2Icon className="size-3" />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <PostDetailDialog
            post={post}
            onLikeToggled={(_postId, likedVal, count, recentLikers) => {
              setLiked(likedVal)
              setLikesCount(count)
              setLikers(recentLikers)
            }}
            onCommentCountChanged={handleCommentCountChanged}
          >
            <div className="cursor-pointer">
              {post.title && (
                <h2 className="mt-3 text-base font-semibold hover:underline">
                  {post.title}
                </h2>
              )}

              <PostBody
                body={post.body}
                className={post.title ? "mt-1" : "mt-3"}
              />

              {post.images.length > 0 && (
                <div className="mt-3">
                  <PostImages images={post.images} title={post.title} />
                </div>
              )}
            </div>
          </PostDetailDialog>

          {/* Social Proof + Actions */}
          <div className="mt-3 space-y-2">
            {/* Reaction Avatars */}
            {likesCount > 0 && (
              <ReactionAvatars
                postId={post.id}
                likesCount={likesCount}
                recentLikers={likers}
              />
            )}

            {/* Actions Bar */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                aria-label={t("like", { count: likesCount })}
                aria-pressed={liked}
                className={cn(
                  liked ? "text-destructive" : "text-muted-foreground",
                  isLikeAnimating && "animate-like-pop"
                )}
              >
                <HeartIcon
                  className={cn(
                    "size-4 transition-transform",
                    liked && "fill-current",
                    isLikeAnimating && "scale-125"
                  )}
                />
                {likesCount}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCommentsExpanded((prev) => !prev)}
                aria-expanded={isCommentsExpanded}
                aria-label={t("commentsCount", { count: commentsCount })}
                className="text-muted-foreground"
              >
                <MessageSquareIcon className="size-4" />
                {commentsCount}
                {isCommentsExpanded ? (
                  <ChevronUpIcon className="size-3" />
                ) : (
                  <ChevronDownIcon className="size-3" />
                )}
              </Button>
            </div>
          </div>

          {isCommentsExpanded && (
            <div className="border-t border-border pt-2">
              <InlineComments
                postId={post.id}
                onCommentCountChanged={handleCommentCountChanged}
              />
            </div>
          )}
        </article>
      </CardContent>
    </Card>
  )
}
