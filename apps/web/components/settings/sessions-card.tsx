"use client"

import { useCallback, useEffect, useState } from "react"
import { MonitorSmartphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { getErrorMessage } from "@/lib/api"
import { useDates } from "@/lib/i18n/use-dates"
import { securityApi, type OwnSession } from "@/lib/security-api"
import { describeUserAgent } from "@/lib/user-agent"

/** The signed-in person's sessions (R-11): which devices, from where, and signing them out. */
export function SessionsCard() {
  const t = useTranslations("settings.sessions")
  const tc = useTranslations("common")
  const dates = useDates()
  const [sessions, setSessions] = useState<OwnSession[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmOthers, setConfirmOthers] = useState(false)

  const load = useCallback(async () => {
    try {
      setSessions(await securityApi.listSessions())
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])
  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const device = (s: OwnSession) => {
    const known = describeUserAgent(s.userAgent)
    return known ? t("device", known) : t("unknownDevice")
  }

  async function run(id: string, action: () => Promise<void>, done: string) {
    setBusy(id)
    try {
      await action()
      toast.success(done)
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!sessions ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3">
                <MonitorSmartphoneIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {device(s)}
                    {s.current && (
                      <StatusBadge tone="info">{t("current")}</StatusBadge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t("details", {
                      ip: s.ipAddress ?? t("unknownAddress"),
                      when: dates.relative(s.lastUsedAt),
                    })}
                  </div>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={t("signOutFor", { device: device(s) })}
                    onClick={() =>
                      run(
                        s.id,
                        () => securityApi.closeSession(s.id),
                        t("closed")
                      )
                    }
                  >
                    {t("signOut")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {others > 0 && (
          <Button
            variant="outline"
            className="self-start"
            disabled={busy !== null}
            onClick={() => setConfirmOthers(true)}
          >
            {t("closeOthers")}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={confirmOthers} onOpenChange={setConfirmOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closeOthersTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("closeOthersBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void run(
                  "others",
                  securityApi.closeOtherSessions,
                  t("othersClosed")
                )
              }
            >
              {t("closeOthers")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
