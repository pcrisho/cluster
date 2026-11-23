"use client"

import { useState } from "react"
import { ImageIcon, MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PostDialog, type PostType } from "@/components/connect/post-dialog"
import type { PendingAction } from "@/components/connect/post-composer-fields"

interface PostComposerCardProps {
  onPostCreated: () => void
}

/** The one way into the composer: a prompt, with shortcuts to start from a photo or an announcement. */
export function PostComposerCard({ onPostCreated }: PostComposerCardProps) {
  const t = useTranslations("connect.feed")
  const { user } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preselectedType, setPreselectedType] = useState<PostType>("POST")
  const [pendingAction, setPendingAction] = useState<PendingAction>("none")

  const canAnnounce = user?.role === "ADMIN" || user?.role === "MANAGER"

  const openDialog = (type: PostType, action: PendingAction) => {
    setPreselectedType(type)
    setPendingAction(action)
    setDialogOpen(true)
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 shrink-0">
              {user?.avatarUrl && (
                <AvatarImage
                  src={getImageUrl(user.avatarUrl) || undefined}
                  alt={`${user.firstName} ${user.lastName}`}
                />
              )}
              <AvatarFallback>
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="outline"
              onClick={() => openDialog("POST", "focus-editor")}
              className="h-10 min-w-0 flex-1 justify-start px-4 font-normal text-muted-foreground"
            >
              <span className="truncate">{t("composePrompt")}</span>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openDialog("POST", "open-picker")}
              className="text-muted-foreground"
            >
              <ImageIcon data-icon="inline-start" />
              {t("photo")}
            </Button>
            {canAnnounce && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => openDialog("ANNOUNCEMENT", "focus-editor")}
                className="text-muted-foreground"
              >
                <MegaphoneIcon data-icon="inline-start" />
                {t("announcement")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <PostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onPostSaved={() => {
          onPostCreated()
          setDialogOpen(false)
        }}
        initialType={preselectedType}
        pendingAction={pendingAction}
        onPendingActionConsumed={() => setPendingAction("none")}
      />
    </>
  )
}
