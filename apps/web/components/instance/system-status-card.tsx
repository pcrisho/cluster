"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  MinusCircleIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { getErrorMessage } from "@/lib/api"
import { adminApi, type InstanceSystemStatus } from "@/lib/admin-api"
import type { Tone } from "@/lib/tone"

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

const OVERALL_TONE: Record<InstanceSystemStatus["status"], Tone> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
}

const OVERALL_ICON = {
  ok: CheckCircle2Icon,
  degraded: AlertTriangleIcon,
  down: XCircleIcon,
} as const

const CHECK_TONE: Record<"ok" | "down" | "unconfigured", Tone> = {
  ok: "success",
  down: "danger",
  unconfigured: "neutral",
}

const CHECK_ICON = {
  ok: CheckCircle2Icon,
  down: XCircleIcon,
  unconfigured: MinusCircleIcon,
} as const

const CORE_KEYS = ["database", "redis", "storage"] as const

/** Read-only live health overview of core infrastructure for the instance superadmin. */
export function SystemStatusCard() {
  const t = useTranslations("instance.systemStatus")
  const format = useFormatter()
  const [status, setStatus] = useState<InstanceSystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await adminApi.getInstanceStatus())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    adminApi
      .getInstanceStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const OverallIcon = status ? OVERALL_ICON[status.status] : CheckCircle2Icon

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("title")}</CardTitle>
            {status && (
              <StatusBadge
                tone={OVERALL_TONE[status.status]}
                icon={OverallIcon}
              >
                {t(`overall.${status.status}`)}
              </StatusBadge>
            )}
          </div>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          aria-busy={loading}
          onClick={() => void refresh()}
          className="shrink-0 self-start"
        >
          {loading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {loading ? t("refreshing") : t("refresh")}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error || t("loadError")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !status ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CORE_KEYS.map((key) => {
                const state = status.checks[key]
                return (
                  <div
                    key={key}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                  >
                    <span className="truncate text-sm font-medium">
                      {t(`services.${key}`)}
                    </span>
                    <StatusBadge
                      tone={CHECK_TONE[state]}
                      icon={CHECK_ICON[state]}
                    >
                      {t(`states.${state}`)}
                    </StatusBadge>
                  </div>
                )
              })}

              <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {t("services.collab")}
                  </span>
                  {status.collab && (
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {t("collabMetrics", {
                        documents: status.collab.documents,
                        connections: status.collab.connections,
                      })}
                    </span>
                  )}
                </div>
                <StatusBadge
                  tone={CHECK_TONE[status.checks.collab]}
                  icon={CHECK_ICON[status.checks.collab]}
                >
                  {t(`states.${status.checks.collab}`)}
                </StatusBadge>
              </div>

              <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5 sm:col-span-2">
                <span className="truncate text-sm font-medium">
                  {t("services.mail")}
                </span>
                <StatusBadge
                  tone={status.mailEnabled ? "success" : "neutral"}
                  icon={status.mailEnabled ? CheckCircle2Icon : MinusCircleIcon}
                >
                  {status.mailEnabled ? t("states.mailOn") : t("states.mailOff")}
                </StatusBadge>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                <span>
                  {t("uptime", { uptime: formatUptime(status.uptimeSeconds) })}
                </span>
                <span>
                  {t("checkedAt", {
                    time: format.dateTime(new Date(status.checkedAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }),
                  })}
                </span>
              </div>
              <span className="font-mono">{t("healthHint")}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
