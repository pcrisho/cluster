"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { LanguageSelect } from "@/components/shared/language-select"
import { OrganizationLogo } from "./organization-logo"
import { OrganizationSkeleton } from "./settings-skeletons"
import { CelebrationsPanel } from "./celebrations-panel"
import { IsolationSwitch } from "./isolation-switch"
import { ModuleSwitches } from "./module-switches"
import { SettingSwitch } from "@/components/shared/setting-switch"
import { adminApi, type Organization } from "@/lib/admin-api"
import { useAuth } from "@/lib/auth-context"
import { getErrorMessage, type Locale, type ModuleKey } from "@/lib/api"
import { useDates } from "@/lib/i18n/use-dates"
import { TimezoneCombobox } from "@/components/shared/timezone-combobox"
import { useTranslations } from "next-intl"

export function OrganizationPanel() {
  const { refreshUser } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [name, setName] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [locale, setLocale] = useState<Locale | null>(null)
  const [instanceLocale, setInstanceLocale] = useState<Locale | undefined>()
  const dates = useDates()
  const tz = useTranslations("settings.timeZone")
  const tl = useTranslations("settings.organization.language")
  const t = useTranslations("settings.organization")
  const tc = useTranslations("common")
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [requireAdminMfa, setRequireAdminMfa] = useState(false)
  const [memberProfileEditing, setMemberProfileEditing] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getOrganization()
      setOrg(data)
      setName(data.name)
      setTimezone(data.timezone)
      setLocale(data.locale)
      setModules(data.enabledModules)
      setRequireAdminMfa(data.requireAdminMfa)
      setMemberProfileEditing(data.memberProfileEditing)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
    // The name shown in "Default (…)"; without it the select falls back to the current language.
    adminApi
      .getPublicInstance()
      .then((i) => setInstanceLocale(i.defaultLocale))
      .catch(() => {})
  }, [load])

  if (!org) return <OrganizationSkeleton />

  const dirty =
    name.trim() !== org.name ||
    timezone !== org.timezone ||
    locale !== org.locale ||
    requireAdminMfa !== org.requireAdminMfa ||
    memberProfileEditing !== org.memberProfileEditing ||
    modules.length !== org.enabledModules.length ||
    modules.some((m) => !org.enabledModules.includes(m))

  function discard() {
    if (!org) return
    setName(org.name)
    setTimezone(org.timezone)
    setLocale(org.locale)
    setModules(org.enabledModules)
    setRequireAdminMfa(org.requireAdminMfa)
    setMemberProfileEditing(org.memberProfileEditing)
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await adminApi.updateOrganization({
        name: name.trim(),
        timezone,
        locale,
        enabledModules: modules,
        requireAdminMfa,
        memberProfileEditing,
      })
      setOrg(updated)
      setLocale(updated.locale)
      setModules(updated.enabledModules)
      setTimezone(updated.timezone)
      setRequireAdminMfa(updated.requireAdminMfa)
      setMemberProfileEditing(updated.memberProfileEditing)
      // Sidebar and route guards read modules, and dates the zone, from the session user.
      await refreshUser()
      toast.success(t("updated"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function logoUpdated(updated: Organization) {
    // Only the logo changed: keep what is being edited in the other fields.
    setOrg((current) =>
      current ? { ...current, logoUrl: updated.logoUrl } : updated
    )
    await refreshUser()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("general")}</CardTitle>
          <CardDescription>
            {t("summary", {
              slug: org.slug,
              count: org.memberCount,
              created: dates.instant(org.createdAt),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-md">
            <Field>
              <FieldLabel>{t("logo.label")}</FieldLabel>
              <OrganizationLogo logoUrl={org.logoUrl} onUpdated={logoUpdated} />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-name">{t("name")}</FieldLabel>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              <FieldDescription>{t("nameHint")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tl("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-md">
            <Field>
              <FieldLabel htmlFor="org-language">{tl("label")}</FieldLabel>
              <LanguageSelect
                id="org-language"
                value={locale}
                onValueChange={setLocale}
                instanceDefault={instanceLocale ?? "en"}
                disabled={saving}
              />
              <FieldDescription>{tl("description")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tz("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-md">
            <Field>
              <FieldLabel htmlFor="org-time-zone">{tz("label")}</FieldLabel>
              <TimezoneCombobox
                id="org-time-zone"
                value={timezone}
                onValueChange={setTimezone}
                disabled={saving}
              />
              <FieldDescription>{tz("description")}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("modules")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldDescription>{t("modulesHint")}</FieldDescription>
          {org.availableModules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noModules")}</p>
          ) : (
            <ModuleSwitches
              modules={org.availableModules}
              value={modules}
              onChange={setModules}
              disabled={saving}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("personalData")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingSwitch
            id="org-member-profile-editing"
            label={t("memberProfileEditing")}
            description={t("memberProfileEditingHint")}
            checked={memberProfileEditing}
            disabled={saving}
            onChange={setMemberProfileEditing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("isolation.title")}</CardTitle>
          <CardDescription>{t("isolation.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <IsolationSwitch
            isolation={org.isolation}
            enabledModules={org.enabledModules}
            disabled={saving}
            onUpdated={setOrg}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("security")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingSwitch
            id="org-require-admin-mfa"
            label={t("requireAdminMfa")}
            description={t("requireAdminMfaHint")}
            checked={requireAdminMfa}
            disabled={saving}
            onChange={setRequireAdminMfa}
          />
        </CardContent>
      </Card>

      {dirty && (
        <div
          role="region"
          aria-label={t("unsaved")}
          className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-muted-foreground">{t("unsaved")}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={discard} disabled={saving}>
              {t("discard")}
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving && <Spinner data-icon="inline-start" />}
              {tc("saveChanges")}
            </Button>
          </div>
        </div>
      )}

      {org.enabledModules.includes("CONNECT") && (
        <Card>
          <CardHeader>
            <CardTitle>{t("celebrations")}</CardTitle>
            <CardDescription>{t("celebrationsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CelebrationsPanel />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
