"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeftIcon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import { connectApi, type ProfileDetail } from "@/lib/connect-api"
import { PageContainer } from "@/components/layout/page"
import {
  MemberProfile,
  MemberProfileSkeleton,
} from "@/components/connect/member-profile"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function ProfilePage() {
  const t = useTranslations("connect.profile")
  const { userId } = useParams<{ userId: string }>()
  const { user: me } = useAuth()
  const router = useRouter()
  // The profile of the last id that finished loading; anything else means still loading.
  const [loaded, setLoaded] = useState<{
    id: string
    profile: ProfileDetail | null
  } | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    connectApi
      .getProfile(userId)
      .then((r) => r.data)
      .catch(() => null)
      .then((profile) => active && setLoaded({ id: userId, profile }))
    return () => {
      active = false
    }
  }, [userId])

  const isLoading = loaded?.id !== userId
  const profile = isLoading ? null : loaded.profile

  // Back keeps the directory's filters and page (they live in the URL); a profile opened from a
  // link has no history to go back to, so it goes to the directory.
  const goBack = () =>
    window.history.length > 1
      ? router.back()
      : router.push("/connect/directory")

  return (
    <PageContainer width="narrow">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 w-fit text-muted-foreground"
        onClick={goBack}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("back")}
      </Button>

      {isLoading ? (
        <MemberProfileSkeleton />
      ) : profile ? (
        <MemberProfile profile={profile} isOwn={me?.id === profile.id} />
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{t("notFound")}</EmptyTitle>
            <EmptyDescription>{t("notFoundBody")}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={goBack}>
            {t("goBack")}
          </Button>
        </Empty>
      )}
    </PageContainer>
  )
}
