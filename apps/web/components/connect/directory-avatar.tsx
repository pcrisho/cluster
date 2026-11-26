"use client"

import type { ComponentProps } from "react"

import { DirectoryUser } from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/** A person's photo, or their initials. */
export function DirectoryAvatar({
  user,
  fallbackClassName,
  ...props
}: {
  user: Pick<DirectoryUser, "firstName" | "lastName" | "avatarUrl">
  fallbackClassName?: string
} & Omit<ComponentProps<typeof Avatar>, "children">) {
  return (
    <Avatar {...props}>
      {user.avatarUrl && (
        <AvatarImage
          src={getImageUrl(user.avatarUrl) || undefined}
          alt={`${user.firstName} ${user.lastName}`}
        />
      )}
      <AvatarFallback className={cn("text-xs font-medium", fallbackClassName)}>
        {user.firstName[0]}
        {user.lastName[0]}
      </AvatarFallback>
    </Avatar>
  )
}
