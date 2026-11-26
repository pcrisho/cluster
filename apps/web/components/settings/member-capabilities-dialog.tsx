"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { adminApi, type Member } from "@/lib/admin-api"
import { getErrorMessage, type Capability, type ModuleKey } from "@/lib/api"
import { useTranslations } from "next-intl"


interface Props {
  member: Member | null
  onOpenChange: (open: boolean) => void
}

/** What a member may do across the whole organization, beyond the spaces they were added to. */
export function MemberCapabilitiesDialog({ member, onOpenChange }: Props) {
  const t = useTranslations("settings.capabilities")
  const [catalog, setCatalog] = useState<{ capability: Capability; module: ModuleKey }[] | null>(null)
  const [granted, setGranted] = useState<Capability[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    queueMicrotask(() => {
      setGranted(null)
      Promise.all([adminApi.listCapabilities(), adminApi.getMemberCapabilities(member.id)])
        .then(([list, mine]) => {
          if (cancelled) return
          setCatalog(list)
          setGranted(mine.capabilities)
        })
        .catch((err) => toast.error(getErrorMessage(err)))
    })
    return () => {
      cancelled = true
    }
  }, [member])

  async function toggle(capability: Capability, on: boolean) {
    if (!member || !granted) return
    const next = on ? [...granted, capability] : granted.filter((c) => c !== capability)
    setSaving(true)
    try {
      setGranted((await adminApi.setMemberCapabilities(member.id, next)).capabilities)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const modules = [...new Set((catalog ?? []).map((c) => c.module))]

  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("title", { name: `${member?.firstName ?? ""} ${member?.lastName ?? ""}` })}
          </DialogTitle>
          <DialogDescription>
            {member?.role === "ADMIN"
              ? t("adminNote")
              : t("note")}
          </DialogDescription>
        </DialogHeader>

        {granted === null || catalog === null ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <div className="space-y-5">
            {modules.map((module) => (
              <section key={module} className="space-y-2">
                <h3 className="text-sm font-medium">{t(`modules.${module}`)}</h3>
                {catalog
                  .filter((c) => c.module === module)
                  .map(({ capability }) => (
                    <label
                      key={capability}
                      className="flex items-center justify-between gap-4 rounded-lg border p-3"
                    >
                      <span>
                        <span className="block text-sm font-medium">{t(`items.${capability}`)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`items.${capability}_hint`)}
                        </span>
                      </span>
                      <Switch
                        checked={granted.includes(capability)}
                        disabled={saving || member?.role === "ADMIN"}
                        onCheckedChange={(on) => toggle(capability, on)}
                        aria-label={t(`items.${capability}`)}
                      />
                    </label>
                  ))}
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
