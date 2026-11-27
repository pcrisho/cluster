"use client"

import { UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import type { Post } from "@/lib/connect-api"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"

/** Shows a post's audience pill when restricted, or an info badge when open under main-node isolation. */
export function PostAudienceBadge({
  post,
  className,
}: {
  post: Pick<Post, "restricted" | "audience" | "hiddenAudienceCount">
  className?: string
}) {
  const t = useTranslations("connect.post")
  const { user } = useAuth()
  const isolated = user?.organization.isolated ?? false

  if (!post.restricted) {
    if (!isolated) return null
    return (
      <StatusBadge tone="info" className={className}>
        {t("visibleToEveryMainNode")}
      </StatusBadge>
    )
  }

  const visible = post.audience ?? []
  const hidden = post.hiddenAudienceCount ?? 0
  let label: string
  if (visible.length === 0) {
    label =
      hidden > 0
        ? t("audienceHiddenOnly", { count: hidden })
        : t("audienceRestricted")
  } else {
    const names = visible.slice(0, 2).map((p) => p.name)
    const extra = visible.length - names.length + hidden
    label =
      extra > 0
        ? t("audienceNamesMore", { names: names.join(", "), count: extra })
        : names.join(", ")
  }

  return (
    <Badge
      variant="outline"
      className={className}
      title={visible.map((p) => p.name).join(", ") || undefined}
    >
      <UsersIcon data-icon="inline-start" aria-hidden />
      <span className="max-w-60 truncate">{label}</span>
    </Badge>
  )
}
