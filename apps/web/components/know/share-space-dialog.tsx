"use client"

import { useCallback, useEffect, useState } from "react"
import { GlobeIcon, LockIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PRINCIPAL_ICON, PrincipalPicker } from "@/components/shared/principal-picker"
import { getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { knowApi, type AccessEntry, type AccessRole } from "@/lib/know-api"
import type { Principal } from "@/lib/org-api"
import { ROLES } from "@/lib/know-roles"
import { isCrosser } from "@/lib/partition"
import { useTranslations } from "next-intl"

interface ShareSpaceDialogProps {
  spaceId: string
  spaceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after any change so the space (restricted flag, my role) is reloaded. */
  onChanged: () => void
}

export function ShareSpaceDialog({ spaceId, spaceName, open, onOpenChange, onChanged }: ShareSpaceDialogProps) {
  const tr = useTranslations("know.roles")
  const t = useTranslations("know.share")
  const { user } = useAuth()
  // While main nodes are isolated only a crosser may open a space to every main node (they may still restrict it).
  const isolated = user?.organization.isolated ?? false
  const openLocked = isolated && !isCrosser(user)
  const [restricted, setRestricted] = useState<boolean | null>(null)
  const [entries, setEntries] = useState<AccessEntry[] | null>(null)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await knowApi.getAccess(spaceId)
      setRestricted(data.restricted)
      setEntries(data.entries)
      setHiddenCount(data.hiddenCount)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [spaceId])

  useEffect(() => {
    if (open) queueMicrotask(() => void load())
  }, [open, load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      await load()
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** Losing your own access, or the last manager, is allowed but deserves a second look. */
  function confirmRisk(entry: AccessEntry, nextRole: AccessRole | null) {
    if (!entries || entry.role !== "MANAGER" || nextRole === "MANAGER") return true
    const isMe = entry.principal.type === "USER" && entry.principal.id === user?.id
    const lastManager = entries.filter((e) => e.role === "MANAGER").length === 1
    if (isMe && user?.role !== "ADMIN") {
      return confirm(t("loseAccess"))
    }
    if (lastManager) {
      return confirm(t("lastManager"))
    }
    return true
  }

  const taken = new Set((entries ?? []).map((e) => `${e.principal.type}:${e.principal.id}`))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: spaceName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {entries === null || restricted === null ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="min-w-0 space-y-5">
            <section className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                {restricted ? <LockIcon className="size-4" /> : <GlobeIcon className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  value={restricted ? "restricted" : "open"}
                  disabled={busy}
                  onValueChange={(value) =>
                    run(() => knowApi.updateSpace(spaceId, { restricted: value === "restricted" }))
                  }
                >
                  <SelectTrigger size="sm" className="w-full border-0 px-0 shadow-none" aria-label={t("generalAccess")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open" disabled={openLocked}>
                      {t("open")}
                    </SelectItem>
                    <SelectItem value="restricted">{t("restricted")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {restricted && openLocked
                    ? t("openLocked")
                    : restricted
                      ? t("restrictedHint")
                      : t("openHint")}
                </p>
                {isolated && !restricted && (
                  <p className="text-xs text-muted-foreground">{t("visibleToEveryMainNode")}</p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("people")}</h3>
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("nobody")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {ROLES.map((role) => `${tr(role)}: ${tr(`${role}_hint`)}`).join(" · ")}
              </p>
              {hiddenCount > 0 && (
                <p className="text-xs text-muted-foreground">{t("hiddenEntries", { count: hiddenCount })}</p>
              )}
              <ul className="space-y-1">
                {entries.map((entry) => {
                  const Icon = PRINCIPAL_ICON[entry.principal.type]
                  return (
                    <li key={entry.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{entry.principal.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {entry.principal.type === "USER"
                            ? entry.principal.detail
                            : entry.principal.type === "ORG_NODE"
                              ? entry.principal.main
                                ? t("mainNode")
                                : t("area")
                              : t("position")}
                        </div>
                      </div>
                      <Select
                        value={entry.role}
                        disabled={busy}
                        onValueChange={(role) => {
                          if (confirmRisk(entry, role as AccessRole)) {
                            void run(() => knowApi.setAccessRole(spaceId, entry.id, role as AccessRole))
                          }
                        }}
                      >
                        <SelectTrigger size="sm" className="w-28" aria-label={t("roleOf", { name: entry.principal.name })}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {tr(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busy}
                        aria-label={t("remove", { name: entry.principal.name })}
                        onClick={() => {
                          if (confirmRisk(entry, null)) void run(() => knowApi.removeAccess(spaceId, entry.id))
                        }}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section>
              {adding ? (
                <PrincipalPicker
                  taken={taken}
                  onPick={(p: Principal) => {
                    setAdding(false)
                    void run(() =>
                      knowApi.addAccess(spaceId, { principalType: p.type, principalId: p.id, role: "VIEWER" })
                    )
                  }}
                />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <PlusIcon data-icon="inline-start" />
                  {t("add")}
                </Button>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
