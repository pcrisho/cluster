"use client"

import { useState, useEffect } from "react"
import { CameraIcon, CheckIcon, Loader2Icon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { settingsApi } from "@/lib/settings-api"
import { orgApi } from "@/lib/org-api"
import { getImageUrl } from "@/lib/images"
import { ImageCropperDialog } from "./image-cropper-dialog"
import { PhoneInput } from "@/components/shared/phone-input"
import { LanguageSelect } from "@/components/shared/language-select"
import { adminApi } from "@/lib/admin-api"
import type { Locale } from "@/lib/i18n/locales"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/lib/api"

export function ProfilePanel({ user }: { user: AuthUser }) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [locale, setLocale] = useState<Locale | null>(user.locale)
  const [instanceLocale, setInstanceLocale] = useState<Locale | undefined>()
  const tl = useTranslations("settings.language")
  const ta = useTranslations("settings.avatar")
  const t = useTranslations("settings.profile")
  const tc = useTranslations("common")
  const tr = useTranslations("common.roles")
  const [isSaving, setIsSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(
    null
  )
  const [showCropper, setShowCropper] = useState(false)
  const { refreshUser } = useAuth()

  // Connect profile fields (read-only org/position, editable bio/phone)
  const [bio, setBio] = useState("")
  const [phone, setPhone] = useState("")
  const [positionName, setPositionName] = useState<string | null>(null)
  const [orgNodeName, setOrgNodeName] = useState<string | null>(null)
  const [initialBio, setInitialBio] = useState("")
  const [initialPhone, setInitialPhone] = useState("")

  useEffect(() => {
    // The name shown in "Instance default (…)"; without it the select falls back to the current language.
    adminApi
      .getPublicInstance()
      .then((i) => setInstanceLocale(i.defaultLocale))
      .catch(() => {})
    orgApi.getMyProfile().then((r) => {
      if (r.data) {
        setBio(r.data.bio ?? "")
        setInitialBio(r.data.bio ?? "")
        setPhone(r.data.phone ?? "")
        setInitialPhone(r.data.phone ?? "")
        setPositionName(r.data.position?.name ?? null)
        setOrgNodeName(r.data.orgNode?.name ?? null)
      }
    })
  }, [])

  const hasChanges =
    firstName !== user.firstName ||
    lastName !== user.lastName ||
    locale !== user.locale ||
    bio !== initialBio ||
    phone !== initialPhone

  const initials = `${user.firstName[0]}${user.lastName[0]}`
  // The organization manages name, photo, phone and bio; ADMINs keep editing theirs (PROFILE_LOCKED).
  const locked =
    !user.organization.memberProfileEditing && user.role !== "ADMIN"

  // Profile completion checklist
  const completionItems = [
    { id: "avatar", label: t("addPhoto"), completed: !!avatarUrl },
    { id: "bio", label: t("writeBio"), completed: bio.length > 0 },
    { id: "phone", label: t("addPhone"), completed: phone.length > 0 },
  ]
  const completedCount = completionItems.filter((i) => i.completed).length
  const isProfileComplete = completedCount === completionItems.length

  function handleAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedAvatarFile(file)
      setShowCropper(true)
    }
  }

  function handleAvatarUpdated(url: string) {
    setAvatarUrl(url)
    refreshUser()
  }

  function handleCropperClose() {
    setShowCropper(false)
    setSelectedAvatarFile(null)
  }

  async function handleSave() {
    if (!hasChanges) return
    setIsSaving(true)
    try {
      const authChanged =
        firstName !== user.firstName ||
        lastName !== user.lastName ||
        locale !== user.locale
      const profileChanged = bio !== initialBio || phone !== initialPhone

      if (authChanged) {
        await settingsApi.updateProfile({
          firstName: firstName !== user.firstName ? firstName : undefined,
          lastName: lastName !== user.lastName ? lastName : undefined,
          locale: locale !== user.locale ? locale : undefined,
        })
      }

      if (profileChanged) {
        await orgApi.updateMyProfile({
          bio: bio !== initialBio ? bio : undefined,
          phone: phone !== initialPhone ? phone : undefined,
        })
        setInitialBio(bio)
        setInitialPhone(phone)
      }

      toast.success(t("updated"))
      refreshUser()
    } catch {
      toast.error(t("failed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <FieldGroup>
      {/* Profile completion banner */}
      {!locked && !isProfileComplete && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{t("complete")}</p>
            <span className="text-xs text-muted-foreground">
              {completedCount}/{completionItems.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {completionItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  item.completed
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    item.completed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {item.completed && <CheckIcon className="size-2.5" />}
                </div>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 pt-4">
        <div className="relative">
          <Avatar className="size-16">
            <AvatarImage src={getImageUrl(avatarUrl) || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          {!locked && (
            <label
              className="absolute -right-1 -bottom-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs"
              aria-label={t("changePhoto")}
            >
              <CameraIcon className="size-3" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileSelected}
              />
            </label>
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">{tr(user.role)}</p>
        </div>
      </div>
      {locked && (
        <p className="text-sm text-muted-foreground">{t("managedByOrg")}</p>
      )}

      <ImageCropperDialog
        open={showCropper}
        file={selectedAvatarFile}
        onClose={handleCropperClose}
        onSave={async (key) => {
          await settingsApi.updateProfile({ avatarUrl: key })
          handleAvatarUpdated(key)
        }}
        labels={{
          title: ta("title"),
          description: ta("description"),
          updated: ta("updated"),
          failed: ta("failed"),
        }}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="profile-first">{t("firstName")}</FieldLabel>
          <Input
            id="profile-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={locked}
            maxLength={100}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-last">{t("lastName")}</FieldLabel>
          <Input
            id="profile-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={locked}
            maxLength={100}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
        <Input id="profile-email" value={user.email} disabled />
      </Field>

      <Field>
        <FieldLabel htmlFor="profile-language">{tl("label")}</FieldLabel>
        <LanguageSelect
          id="profile-language"
          value={locale}
          onValueChange={setLocale}
          instanceDefault={
            user.organization.locale ?? instanceLocale ?? user.effectiveLocale
          }
        />
        <FieldDescription>{tl("description")}</FieldDescription>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel>{t("area")}</FieldLabel>
          <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
            {orgNodeName ? (
              <Badge variant="secondary">{orgNodeName}</Badge>
            ) : (
              <span className="text-muted-foreground italic">{t("notAssigned")}</span>
            )}
          </div>
        </Field>
        <Field>
          <FieldLabel>{t("position")}</FieldLabel>
          <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
            {positionName ? (
              <Badge variant="outline">{positionName}</Badge>
            ) : (
              <span className="text-muted-foreground italic">{t("notAssigned")}</span>
            )}
          </div>
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {t("assignedByAdmin")}
      </p>

      <Field>
        <FieldLabel htmlFor="profile-phone">{t("phone")}</FieldLabel>
        {locked ? (
          <Input id="profile-phone" value={phone} disabled />
        ) : (
          <PhoneInput id="profile-phone" value={phone} onChange={setPhone} />
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="profile-bio">{t("bio")}</FieldLabel>
        <Textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t("bioPlaceholder")}
          className="resize-none"
          maxLength={500}
          rows={3}
          disabled={locked}
        />
      </Field>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving && <Loader2Icon className="animate-spin" />}
          {tc("saveChanges")}
        </Button>
      </div>
    </FieldGroup>
  )
}
