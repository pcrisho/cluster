"use client"

import { useMemo } from "react"
import { GlobeIcon, LockIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import { isCrosser } from "@/lib/partition"
import type { Principal } from "@/lib/org-api"
import {
  PRINCIPAL_ICON,
  PrincipalPicker,
} from "@/components/shared/principal-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

interface PostAudienceFieldProps {
  restricted: boolean
  onRestrictedChange: (restricted: boolean) => void
  audience: Principal[]
  onAudienceChange: (audience: Principal[]) => void
  hiddenAudienceCount?: number
  noArea?: boolean
  disabled?: boolean
}

/** Audience selector for a CONNECT post: everyone (or all main nodes) vs specific people, areas or positions. */
export function PostAudienceField({
  restricted,
  onRestrictedChange,
  audience,
  onAudienceChange,
  hiddenAudienceCount = 0,
  noArea = false,
  disabled = false,
}: PostAudienceFieldProps) {
  const t = useTranslations("connect.composer")
  const { user } = useAuth()
  const isolated = user?.organization.isolated ?? false
  const canOpen = !isolated || isCrosser(user)

  const taken = useMemo(
    () => new Set(audience.map((p) => `${p.type}:${p.id}`)),
    [audience]
  )

  const add = (principal: Principal) => {
    const key = `${principal.type}:${principal.id}`
    if (taken.has(key)) return
    onAudienceChange([...audience, principal])
  }

  const remove = (principal: Principal) => {
    onAudienceChange(
      audience.filter(
        (p) => !(p.type === principal.type && p.id === principal.id)
      )
    )
  }

  return (
    <Field className="mb-3 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel className="text-xs text-muted-foreground">
          {t("audienceLabel")}
        </FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={restricted ? "restricted" : "open"}
          onValueChange={(value) => {
            if (!value || disabled) return
            if (value === "open" && !canOpen) return
            onRestrictedChange(value === "restricted")
          }}
          aria-label={t("audienceLabel")}
        >
          <ToggleGroupItem value="open" disabled={disabled || !canOpen}>
            <GlobeIcon data-icon="inline-start" />
            {isolated ? t("audienceAllMainNodes") : t("audienceEveryone")}
          </ToggleGroupItem>
          <ToggleGroupItem value="restricted" disabled={disabled}>
            <LockIcon data-icon="inline-start" />
            {t("audienceSpecific")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!restricted && isolated && (
        <Alert variant="info">
          <AlertDescription>{t("audienceOpenHint")}</AlertDescription>
        </Alert>
      )}

      {restricted && (
        <div className="flex flex-col gap-2">
          {noArea && audience.length === 0 && (
            <Alert variant="warning">
              <AlertDescription>{t("audienceNoArea")}</AlertDescription>
            </Alert>
          )}

          {audience.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {audience.map((principal) => {
                const Icon = PRINCIPAL_ICON[principal.type]
                return (
                  <Badge
                    key={`${principal.type}:${principal.id}`}
                    variant="secondary"
                    className="gap-1.5 pr-1 font-normal"
                  >
                    <Icon className="size-3 text-muted-foreground" aria-hidden />
                    <span className="max-w-44 truncate">{principal.name}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => remove(principal)}
                      aria-label={t("removeAudience", { name: principal.name })}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground disabled:pointer-events-none"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                )
              })}
            </div>
          )}

          {hiddenAudienceCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("hiddenAudience", { count: hiddenAudienceCount })}
            </p>
          )}

          {!disabled && (
            <PrincipalPicker
              taken={taken}
              takenLabel={t("audienceSelected")}
              onPick={add}
            />
          )}
        </div>
      )}
    </Field>
  )
}
