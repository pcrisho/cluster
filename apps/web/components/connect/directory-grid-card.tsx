"use client"

import Link from "next/link"

import { DirectoryUser } from "@/lib/connect-api"
import { DirectoryAvatar } from "@/components/connect/directory-avatar"

export function DirectoryGridCard({ user }: { user: DirectoryUser }) {
  return (
    <Link
      href={`/connect/directory/${user.id}`}
      className="flex min-h-32 flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <DirectoryAvatar user={user} className="size-12" />
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {user.firstName} {user.lastName}
        </p>
        <p className="truncate text-xs text-foreground">
          {user.profile?.position?.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {user.profile?.orgNode?.name}
        </p>
      </div>
    </Link>
  )
}
