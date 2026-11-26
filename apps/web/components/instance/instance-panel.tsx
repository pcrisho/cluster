"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageLoading } from "@/components/layout/page"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { ModuleSwitches } from "@/components/settings/module-switches"
import {
  adminApi,
  type InstanceOrganization,
  type InstanceSettings,
} from "@/lib/admin-api"
import { useAuth } from "@/lib/auth-context"
import { ALL_MODULES } from "@/lib/modules"
import { ApiError, getErrorMessage } from "@/lib/api"
import { browserTimeZone } from "@/lib/time-zone"
import { LanguageSelect } from "@/components/shared/language-select"
import { SortHead } from "@/components/shared/sort-head"
import { TablePagination } from "@/components/shared/table-pagination"
import { useClientPage } from "@/hooks/use-client-page"
import { SettingSwitch } from "@/components/shared/setting-switch"
import { TimezoneCombobox } from "@/components/shared/timezone-combobox"
import { useTranslations } from "next-intl"
import { EMPTY_SEEDS, parseSeeds } from "@cluster/theme"

/** God mode: installation-wide settings and organizations. Superadmins only. */
export function InstancePanel() {
  const { user, refreshUser } = useAuth()
  const [settings, setSettings] = useState<InstanceSettings | null>(null)
  const [orgs, setOrgs] = useState<InstanceOrganization[] | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [orgSort, setOrgSort] = useState<"name" | "members">("name")
  const [orgOrder, setOrgOrder] = useState<"asc" | "desc">("asc")
  const [createOpen, setCreateOpen] = useState(false)
  // Organizations that still isolate their main nodes, when the instance switch is refused (409 ISOLATION_IN_USE).
  const [isolationInUse, setIsolationInUse] = useState<{
    message: string
    organizations: { id: string; name: string }[]
  } | null>(null)
  const tl = useTranslations("instance.language")
  const t = useTranslations("instance")

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        adminApi.getInstanceSettings(),
        adminApi.listInstanceOrganizations(),
      ])
      setSettings(s)
      setOrgs(o)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function patchSettings(data: Partial<InstanceSettings>, key: string) {
    setSavingKey(key)
    try {
      setSettings(await adminApi.updateInstanceSettings(data))
      setIsolationInUse(null)
      // Modules and, for people with no language of their own, the language come from the session user.
      if (data.availableModules || data.defaultLocale) await refreshUser()
      toast.success(t("updated"))
    } catch (err) {
      if (err instanceof ApiError && err.code === "ISOLATION_IN_USE") {
        // Shown in the card, not as a toast: the switch stays on and the list says what to change.
        setIsolationInUse({
          message: getErrorMessage(err),
          organizations:
            (err.details as { organizations?: { id: string; name: string }[] })
              .organizations ?? [],
        })
      } else {
        toast.error(getErrorMessage(err))
      }
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleOrg(
    org: InstanceOrganization,
    field: "isActive" | "themingEnabled"
  ) {
    const key = `${field}:${org.id}`
    setSavingKey(key)
    try {
      await adminApi.updateInstanceOrganization(org.id, {
        [field]: !org[field],
      })
      setOrgs(
        (list) =>
          list?.map((o) =>
            o.id === org.id ? { ...o, [field]: !o[field] } : o
          ) ?? null
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingKey(null)
    }
  }

  const sortedOrgs = useMemo(() => {
    const sign = orgOrder === "asc" ? 1 : -1
    return [...(orgs ?? [])].sort((a, b) =>
      orgSort === "members"
        ? sign * (a.memberCount - b.memberCount) || a.name.localeCompare(b.name)
        : sign * a.name.localeCompare(b.name)
    )
  }, [orgs, orgSort, orgOrder])
  const orgPage = useClientPage(sortedOrgs)
  const sortOrgsBy = (column: "name" | "members") => {
    setOrgSort(column)
    setOrgOrder(orgSort === column && orgOrder === "asc" ? "desc" : "asc")
    orgPage.setPage(1)
  }

  if (!settings || !orgs) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("access")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SettingSwitch
              id="registration-open"
              label={t("signUp")}
              description={t("signUpHint")}
              checked={settings.registrationOpen}
              disabled={savingKey === "registrationOpen"}
              onChange={(registrationOpen) =>
                patchSettings({ registrationOpen }, "registrationOpen")
              }
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tl("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="instance-language">{tl("label")}</FieldLabel>
            <LanguageSelect
              id="instance-language"
              value={settings.defaultLocale}
              onValueChange={(defaultLocale) =>
                defaultLocale &&
                patchSettings({ defaultLocale }, "defaultLocale")
              }
              disabled={savingKey === "defaultLocale"}
            />
            <FieldDescription>{tl("description")}</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <AppearancePanel
        scope="instance"
        saved={parseSeeds(settings) ?? EMPTY_SEEDS}
        baseline={EMPTY_SEEDS}
        glassSaved={settings.glassKey ?? null}
        onSave={async (theme, glassKey) => {
          setSettings(
            await adminApi.updateInstanceSettings({
              theme: { ...theme, glassKey },
            })
          )
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("orgTheming.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingSwitch
            id="org-theming-allowed"
            label={t("orgTheming.label")}
            description={t("orgTheming.hint")}
            checked={settings.orgThemingAllowed}
            disabled={savingKey === "orgThemingAllowed"}
            onChange={(orgThemingAllowed) =>
              patchSettings({ orgThemingAllowed }, "orgThemingAllowed")
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nodeIsolation.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SettingSwitch
            id="node-isolation-allowed"
            label={t("nodeIsolation.label")}
            description={t("nodeIsolation.hint")}
            checked={settings.nodeIsolationAllowed}
            disabled={savingKey === "nodeIsolationAllowed"}
            onChange={(nodeIsolationAllowed) =>
              patchSettings({ nodeIsolationAllowed }, "nodeIsolationAllowed")
            }
          />
          {isolationInUse && (
            <Alert variant="danger">
              <AlertTitle>{isolationInUse.message}</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {isolationInUse.organizations.map((org) => (
                    <li key={org.id}>{org.name}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("breachCheck.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingSwitch
            id="password-breach-check"
            label={t("breachCheck.label")}
            description={t("breachCheck.hint")}
            checked={settings.passwordBreachCheck}
            disabled={savingKey === "passwordBreachCheck"}
            onChange={(passwordBreachCheck) =>
              patchSettings({ passwordBreachCheck }, "passwordBreachCheck")
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("availableModules")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldDescription>{t("availableModulesHint")}</FieldDescription>
          <ModuleSwitches
            modules={ALL_MODULES}
            value={settings.availableModules}
            disabled={savingKey === "availableModules"}
            onChange={(availableModules) =>
              patchSettings({ availableModules }, "availableModules")
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("organizations")}</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("newOrganizationButton")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <SortHead
                    sort="name"
                    label={t("name")}
                    active={orgSort === "name"}
                    order={orgOrder}
                    onSort={sortOrgsBy}
                  />
                  <SortHead
                    sort="members"
                    label={t("members")}
                    active={orgSort === "members"}
                    order={orgOrder}
                    onSort={sortOrgsBy}
                  />
                  <TableHead>{t("modules")}</TableHead>
                  <TableHead>{t("orgTheming.column")}</TableHead>
                  <TableHead className="text-right">{t("active")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgPage.rows.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{org.name}</span>
                        {org.isolateRootNodes && (
                          <StatusBadge tone="info">
                            {t("nodeIsolation.isolated")}
                          </StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {org.slug}
                      </div>
                    </TableCell>
                    <TableCell>{org.memberCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {org.enabledModules.map((m) => (
                          <Badge key={m} variant="outline">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          aria-label={t("orgTheming.toggle", {
                            name: org.name,
                          })}
                          checked={org.themingEnabled}
                          disabled={savingKey === `themingEnabled:${org.id}`}
                          onCheckedChange={() =>
                            toggleOrg(org, "themingEnabled")
                          }
                        />
                        {!settings.orgThemingAllowed && (
                          <span className="text-xs text-muted-foreground">
                            {t("orgTheming.offForInstance")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        aria-label={
                          org.isActive
                            ? t("suspend", { name: org.name })
                            : t("reactivate", { name: org.name })
                        }
                        checked={org.isActive}
                        // Suspending your own organization would lock you out.
                        disabled={
                          savingKey === `isActive:${org.id}` ||
                          org.id === user?.organizationId
                        }
                        onCheckedChange={() => toggleOrg(org, "isActive")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={orgPage.page}
            pageSize={orgPage.pageSize}
            total={orgPage.total}
            onPageChange={orgPage.setPage}
            onPageSizeChange={orgPage.setPageSize}
          />
        </CardContent>
      </Card>

      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
    </div>
  )
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const tc = useTranslations("common")
  const ti = useTranslations("instance")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [timezone, setTimezone] = useState(browserTimeZone)
  const [saving, setSaving] = useState(false)
  const t = useTranslations("instance.newOrganization")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { inviteSent, mailEnabled } =
        await adminApi.createInstanceOrganization({
          name,
          timezone,
          admin: { email, firstName, lastName },
        })
      if (inviteSent) toast.success(ti("createdInvited", { email }))
      // Mail off: the operator command prints the ADMIN's first link.
      else if (!mailEnabled)
        toast.warning(ti("createdMailOff", { email }), {
          duration: Infinity,
          closeButton: true,
        })
      else toast.warning(ti("createdNoEmail"))
      setName("")
      setEmail("")
      setFirstName("")
      setLastName("")
      setTimezone(browserTimeZone())
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-new-name">{t("name")}</FieldLabel>
              <Input
                id="org-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-new-time-zone">
                {t("timeZone")}
              </FieldLabel>
              <TimezoneCombobox
                id="org-new-time-zone"
                value={timezone}
                onValueChange={setTimezone}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="org-admin-first">
                  {t("adminFirst")}
                </FieldLabel>
                <Input
                  id="org-admin-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-admin-last">
                  {t("adminLast")}
                </FieldLabel>
                <Input
                  id="org-admin-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  maxLength={100}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="org-admin-email">
                {t("adminEmail")}
              </FieldLabel>
              <Input
                id="org-admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
