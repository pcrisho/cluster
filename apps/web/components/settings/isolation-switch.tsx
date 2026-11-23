"use client"

import { useState } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { SettingSwitch } from "@/components/shared/setting-switch"
import { adminApi, type Organization } from "@/lib/admin-api"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage, type ModuleKey } from "@/lib/api"
import { isolationBlock } from "./isolation-rules"

/** "Isolate main nodes": on needs the instance switch and no CONNECT or LIFE; off is always allowed. */
export function IsolationSwitch({
  isolation,
  enabledModules,
  disabled,
  onUpdated,
}: {
  isolation: Organization["isolation"]
  enabledModules: ModuleKey[]
  disabled: boolean
  onUpdated: (org: Organization) => void
}) {
  const { refreshUser } = useAuth()
  const t = useTranslations("settings.organization.isolation")
  const tc = useTranslations("common")
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const block = isolationBlock(isolation, enabledModules)
  const locked = !isolation.enabled && block !== null

  async function change(isolateRootNodes: boolean) {
    setSaving(true)
    try {
      onUpdated(await adminApi.updateOrganization({ isolateRootNodes }))
      // The sidebar and the invite dialog read `organization.isolated` from the session user.
      await refreshUser()
      toast.success(t("updated"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingSwitch
        id="org-isolate-root-nodes"
        label={t("label")}
        description={t("hint")}
        checked={isolation.enabled}
        disabled={disabled || saving || locked}
        onChange={() => setConfirming(true)}
      />
      {locked && (
        <Alert variant="warning">
          <AlertDescription>
            {block === "instance" ? t("blockedInstance") : t("blockedModules")}
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isolation.enabled ? t("offTitle") : t("onTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                {isolation.enabled ? (
                  <p>{t("offBody")}</p>
                ) : (
                  <>
                    {isolation.peopleWithoutNode > 0 && (
                      <p>
                        {t("withoutNode", {
                          count: isolation.peopleWithoutNode,
                        })}
                      </p>
                    )}
                    <p>{t("onBody")}</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => void change(!isolation.enabled)}
            >
              {saving && <Spinner data-icon="inline-start" />}
              {isolation.enabled ? t("offConfirm") : t("onConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
