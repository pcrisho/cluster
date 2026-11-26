"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getImageUrl } from "@/lib/images"
import type { Peer } from "@/lib/collab/collab-session"
import { useTranslations } from "next-intl"

const MAX_SHOWN = 5

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")

/** Who is on the page, one avatar per person (several tabs count once). Readers are marked. */
export function PresenceAvatars({ peers }: { peers: Peer[] }) {
  const t = useTranslations("collab")
  if (peers.length === 0) return null
  const shown = peers.slice(0, MAX_SHOWN)
  const hidden = peers.length - shown.length
  return (
    <div className="flex items-center gap-1" aria-label={t("peers")}>
      {shown.map((peer) => (
        <Tooltip key={peer.userId}>
          <TooltipTrigger asChild>
            <Avatar
              size="sm"
              className="ring-2"
              style={{ ["--tw-ring-color" as string]: peer.color }}
            >
              <AvatarImage src={getImageUrl(peer.avatarUrl) ?? undefined} />
              <AvatarFallback>{initials(peer.name) || "?"}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            {peer.mode === "READ"
              ? t("viewOnly", { name: peer.name })
              : peer.name}
          </TooltipContent>
        </Tooltip>
      ))}
      {hidden > 0 && (
        <span className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  )
}
