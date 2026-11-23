"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CheckIcon, InfoIcon } from "lucide-react"
import { toast } from "sonner"
import {
  EMPTY_SEEDS,
  FONT_KEYS,
  FONT_LABELS,
  PRESETS,
  GLASS_KEYS,
  RADIUS_KEYS,
  deriveTheme,
  normalizeHex,
  resolveSeeds,
  type FontKey,
  type GlassKey,
  type RadiusKey,
  type Seeds,
} from "@cluster/theme"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError, getErrorMessage } from "@/lib/api"
import { isDirty, isGlassDirty, toPayload } from "@/lib/theme/appearance-form"
import { cn } from "@/lib/utils"
import { AppearanceContrast } from "./appearance-contrast"
import { AppearanceGlassPreview } from "./appearance-glass-preview"
import { HexField } from "./appearance-hex-field"
import { AppearancePreview } from "./appearance-preview"

const INHERIT = "inherit"
const GLASS_CHOICES = ["off", ...GLASS_KEYS] as const

/**
 * Brand colours, font and corners of the instance or of one organization. `baseline` is what
 * an unset field falls back to: nothing for the instance, the instance's seeds for an organization.
 * `glassSaved` is the instance's glass level (`null` = Off); leave it out where glass is not set
 * (organizations): the control and its preview are not shown.
 */
export function AppearancePanel({
  scope,
  saved,
  baseline,
  glassSaved,
  onSave,
  disabledReason,
}: {
  scope: "instance" | "organization"
  saved: Seeds
  baseline: Seeds
  glassSaved?: GlassKey | null
  onSave: (seeds: Seeds, glass: GlassKey | null) => Promise<void>
  disabledReason?: string
}) {
  const t = useTranslations("settings.appearance")
  const tc = useTranslations("common")
  const tp = useTranslations("settings.appearance.presetNames")
  const [form, setForm] = useState<Seeds>(saved)
  const [glass, setGlass] = useState<GlassKey | null>(glassSaved ?? null)
  const [saving, setSaving] = useState(false)
  const [colourError, setColourError] = useState<string | null>(null)

  const payload = toPayload(form)
  const effective = resolveSeeds(baseline, payload)
  const dirty = isDirty(saved, form) || isGlassDirty(glassSaved, glass)
  const invalid = (value: string | null) => !!value && !normalizeHex(value)
  const primaryInvalid = invalid(form.brandPrimary)
  const secondaryInvalid =
    !!payload.brandPrimary && invalid(form.brandSecondary)
  // Only the colour typed here: an organization is not told about the instance's own colour.
  const adjusted = payload.brandPrimary
    ? deriveTheme({ primary: payload.brandPrimary }).adjusted
    : null
  const set = (patch: Partial<Seeds>) => {
    setColourError(null)
    setForm((f) => ({ ...f, ...patch }))
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(payload, glass)
      setForm(payload)
      toast.success(t(`saved.${scope}`))
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_COLOR")
        setColourError(getErrorMessage(err))
      else toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <CardHeader>
      {scope === "instance" && <CardTitle>{t("title")}</CardTitle>}
      <CardDescription>{t(`description.${scope}`)}</CardDescription>
    </CardHeader>
  )

  if (disabledReason)
    return (
      <Card>
        {header}
        <CardContent>
          <Alert variant="info">
            <InfoIcon />
            <AlertDescription>{disabledReason}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )

  const inheritedFont = FONT_LABELS[baseline.fontKey ?? "inter"]
  const inheritedRadius = t(`radiusKeys.${baseline.radiusKey ?? "default"}`)

  return (
    <>
      <Card>
        {header}
        <CardContent className="flex flex-col gap-6">
          <FieldGroup className="max-w-md">
            <Field>
              <FieldLabel id="appearance-presets">{t("presets")}</FieldLabel>
              <div
                role="group"
                aria-labelledby="appearance-presets"
                className="flex flex-wrap gap-2"
              >
                {PRESETS.map((preset) => {
                  const selected = payload.brandPrimary === preset.hex
                  return (
                    <Button
                      key={preset.hex}
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={selected}
                      onClick={() => set({ brandPrimary: preset.hex })}
                      className={cn(selected && "border-foreground")}
                    >
                      <span
                        aria-hidden
                        className="size-4 rounded-full"
                        style={{ backgroundColor: preset.hex }}
                      />
                      {tp(
                        preset.name.toLowerCase() as Parameters<typeof tp>[0]
                      )}
                      {selected && <CheckIcon data-icon="inline-end" />}
                    </Button>
                  )
                })}
              </div>
            </Field>
            <HexField
              id="appearance-primary"
              label={t("primary")}
              description={t("primaryHint")}
              value={form.brandPrimary}
              // Clearing the primary clears the secondary too, as the API does.
              onChange={(brandPrimary) =>
                set({
                  brandPrimary,
                  ...(!brandPrimary && { brandSecondary: null }),
                })
              }
              error={
                primaryInvalid
                  ? t("invalidHex")
                  : !payload.brandSecondary
                    ? colourError
                    : null
              }
            />
            <HexField
              id="appearance-secondary"
              label={t("secondary")}
              description={
                form.brandPrimary
                  ? t("secondaryHint")
                  : t("secondaryNeedsPrimary")
              }
              value={form.brandSecondary}
              onChange={(brandSecondary) => set({ brandSecondary })}
              disabled={!form.brandPrimary}
              error={
                secondaryInvalid
                  ? t("invalidHex")
                  : payload.brandSecondary
                    ? colourError
                    : null
              }
            />
            <Field>
              <FieldLabel htmlFor="appearance-font">{t("font")}</FieldLabel>
              <Select
                value={form.fontKey ?? INHERIT}
                onValueChange={(v) =>
                  set({ fontKey: v === INHERIT ? null : (v as FontKey) })
                }
              >
                <SelectTrigger id="appearance-font" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>
                    {t(`fontInherit.${scope}`, { font: inheritedFont })}
                  </SelectItem>
                  {FONT_KEYS.map((key) => (
                    <SelectItem
                      key={key}
                      value={key}
                      style={{ fontFamily: `var(--font-${key})` }}
                    >
                      {FONT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {glassSaved !== undefined && (
              <Field>
                <FieldLabel id="appearance-glass">
                  {t("glass.label")}
                </FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  aria-labelledby="appearance-glass"
                  value={glass ?? "off"}
                  onValueChange={(v) => {
                    // A click on the selected item gives "": keep the level.
                    if (v) setGlass(v === "off" ? null : (v as GlassKey))
                  }}
                >
                  {GLASS_CHOICES.map((key) => (
                    <ToggleGroupItem key={key} value={key}>
                      {t(`glass.keys.${key}` as "glass.keys.off")}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>{t("glass.description")}</FieldDescription>
                <FieldDescription>{t("glass.hint")}</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel id="appearance-radius">{t("radius")}</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                aria-labelledby="appearance-radius"
                value={form.radiusKey ?? ""}
                onValueChange={(v) =>
                  set({ radiusKey: (v || null) as RadiusKey | null })
                }
              >
                {RADIUS_KEYS.map((key) => (
                  <ToggleGroupItem key={key} value={key}>
                    {t(`radiusKeys.${key}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {!form.radiusKey && (
                <FieldDescription>
                  {t(`radiusInherit.${scope}`, { radius: inheritedRadius })}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>

          {adjusted && (
            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                {t("adjusted", { from: adjusted.from, to: adjusted.to })}
              </AlertDescription>
            </Alert>
          )}

          <section
            aria-label={t("previewTitle")}
            className="grid gap-4 md:grid-cols-2"
          >
            <AppearancePreview seeds={effective} theme="light" />
            <AppearancePreview seeds={effective} theme="dark" />
          </section>

          {glassSaved !== undefined && (
            <section
              aria-label={t("glass.preview.caption")}
              className="grid gap-4 md:grid-cols-2"
            >
              <AppearanceGlassPreview
                seeds={effective}
                theme="light"
                glass={glass}
              />
              <AppearanceGlassPreview
                seeds={effective}
                theme="dark"
                glass={glass}
              />
            </section>
          )}

          <AppearanceContrast seeds={effective} />

          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={saving || (!isDirty(EMPTY_SEEDS, form) && glass === null)}
            onClick={() => {
              set(EMPTY_SEEDS)
              setGlass(null)
            }}
          >
            {t(`reset.${scope}`)}
          </Button>
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
            <Button
              variant="outline"
              onClick={() => {
                set(saved)
                setGlass(glassSaved ?? null)
              }}
              disabled={saving}
            >
              {t("discard")}
            </Button>
            <Button
              onClick={save}
              disabled={saving || primaryInvalid || secondaryInvalid}
              aria-busy={saving}
            >
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? tc("saving") : tc("saveChanges")}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
