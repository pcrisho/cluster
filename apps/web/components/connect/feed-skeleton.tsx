"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { FeedLayout } from "@/components/connect/feed-layout"

function ToolbarSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-10 flex-1" />
        </div>
        <div className="flex items-center gap-1 border-t pt-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

function PostCardSkeleton() {
  return (
    <Card>
      <CardContent className="animate-pulse">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <Skeleton className="mt-4 h-5 w-3/5" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="mt-4 flex items-center gap-6">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
        </div>
      </CardContent>
    </Card>
  )
}

export function FeedSkeleton() {
  return (
    <FeedLayout>
      <div className="space-y-6">
        <ToolbarSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    </FeedLayout>
  )
}
