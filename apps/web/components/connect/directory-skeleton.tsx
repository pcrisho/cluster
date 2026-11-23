"use client"

import { Skeleton } from "@/components/ui/skeleton"

interface DirectorySkeletonProps {
  viewMode: "table" | "grid"
}

export function DirectorySkeleton({ viewMode }: DirectorySkeletonProps) {
  if (viewMode === "table") {
    return (
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="hidden h-5 w-24 sm:block" />
                <Skeleton className="hidden h-5 w-20 md:block" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center">
          <Skeleton className="h-8 w-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4"
        >
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
