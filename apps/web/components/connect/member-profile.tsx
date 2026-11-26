"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { AwardIcon, MailIcon, NetworkIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import type { ProfileDetail } from "@/lib/connect-api"
import { directoryHrefForAreas } from "@/lib/directory-url"
import { useDates } from "@/lib/i18n/use-dates"
import { DirectoryAvatar } from "@/components/connect/directory-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const linkClass =
  "font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

const Dash = () => <span className="text-muted-foreground">&mdash;</span>

/** A member's profile: who they are, where they sit in the organization and how to reach them. */
export function MemberProfile({
  profile,
  isOwn,
}: {
  profile: ProfileDetail
  isOwn: boolean
}) {
  const t = useTranslations("connect.profile")
  const tr = useTranslations("common.roles")
  const dates = useDates()

  const area = profile.profile?.orgNode ?? null
  const position = profile.profile?.position ?? null
  const bio = profile.profile?.bio
  const areaManager = area?.manager ?? null
  const managesArea = !!area && areaManager?.id === profile.id
  const subtitle = [position?.name, area?.name].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <DirectoryAvatar
            user={profile}
            className="size-16"
            fallbackClassName="text-lg"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {profile.firstName} {profile.lastName}
            </h1>
            {subtitle && (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
            {profile.profile?.yearsInOrganization != null && (
              <Badge variant="secondary" className="mt-1.5">
                <AwardIcon />
                {t("tenure", { years: profile.profile.yearsInOrganization })}
              </Badge>
            )}
            {managesArea && area && (
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <NetworkIcon
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
                {t("managerOf", { area: area.name })}
              </p>
            )}
          </div>
        </div>
        {isOwn ? (
          <Button variant="outline" asChild>
            <Link href="/settings/account">{t("edit")}</Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <a href={`mailto:${profile.email}`}>
              <MailIcon data-icon="inline-start" />
              {t("sendEmail")}
            </a>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("information")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label={t("email")}>
              <a href={`mailto:${profile.email}`} className={linkClass}>
                {profile.email}
              </a>
            </Detail>
            <Detail label={t("phone")}>
              {profile.profile?.phone ? (
                <a href={`tel:${profile.profile.phone}`} className={linkClass}>
                  {profile.profile.phone}
                </a>
              ) : (
                <Dash />
              )}
            </Detail>
            <Detail label={t("position")}>{position?.name ?? <Dash />}</Detail>
            <Detail label={t("area")}>
              {area ? (
                <>
                  <Link
                    href={directoryHrefForAreas([area.id])}
                    className={linkClass}
                  >
                    {area.name}
                  </Link>
                  {area.path && area.path.length > 1 && (
                    <span className="block text-xs text-muted-foreground">
                      {area.path.join(" › ")}
                    </span>
                  )}
                </>
              ) : (
                <Dash />
              )}
            </Detail>
            {areaManager && !managesArea && (
              <Detail label={t("areaManager")}>
                <Link
                  href={`/connect/directory/${areaManager.id}`}
                  className={`flex items-center gap-2 ${linkClass}`}
                >
                  <DirectoryAvatar user={areaManager} size="sm" />
                  <span className="truncate">
                    {areaManager.firstName} {areaManager.lastName}
                  </span>
                </Link>
              </Detail>
            )}
            <Detail label={t("role")}>{tr(profile.role)}</Detail>
            <Detail label={t("joined")}>
              {dates.instant(
                profile.profile?.joinedAt ?? profile.createdAt,
                "monthYear"
              )}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      {bio && (
        <Card>
          <CardHeader>
            <CardTitle>{t("about")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {bio}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** The same shape as the profile while it loads. */
export function MemberProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
