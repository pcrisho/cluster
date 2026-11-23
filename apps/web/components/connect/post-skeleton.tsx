"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function PostSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card p-4">
      {/* Author header */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>

      {/* Title skeleton */}
      <Skeleton className="mt-4 h-5 w-3/5" />

      {/* Body skeleton - 3 lines */}
      <div className="mt-3 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>

      {/* Image placeholder */}
      <Skeleton className="mt-3 h-48 w-full rounded-lg" />

      {/* Actions bar */}
      <div className="mt-4 flex items-center gap-6">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  )
}
