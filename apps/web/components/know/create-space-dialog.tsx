"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GlobeIcon, Loader2Icon, LockIcon } from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { isCrosser } from "@/lib/partition"
import { knowApi, type Space } from "@/lib/know-api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { EntityIconPicker } from "@/components/shared/entity-icon-picker"
import { useTranslations } from "next-intl"

type IconValue = Pick<Space, "iconType" | "icon" | "emoji">

const DEFAULT_ICON: IconValue = {
  iconType: "LUCIDE",
  icon: "book-open",
  emoji: null,
}

/** Creates a space and opens it. */
export function CreateSpaceDialog({ children }: { children: React.ReactNode }) {
  const tc = useTranslations("common")
  const t = useTranslations("know.createSpace")
  const router = useRouter()
  const { user } = useAuth()
  // While main nodes are isolated a new space is restricted, and only a crosser may open one.
  const isolated = user?.organization.isolated ?? false
  const openLocked = isolated && !isCrosser(user)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [icon, setIcon] = useState<IconValue>(DEFAULT_ICON)
  const [restricted, setRestricted] = useState(isolated)
  const [isLoading, setIsLoading] = useState(false)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setName("")
      setIcon(DEFAULT_ICON)
      setRestricted(isolated)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsLoading(true)
    try {
      const result = await knowApi.createSpace({
        name: name.trim(),
        restricted,
        iconType: icon.iconType,
        ...(icon.iconType === "EMOJI"
          ? { emoji: icon.emoji ?? undefined }
          : { icon: icon.icon }),
      })
      toast.success(t("created"))
      handleOpenChange(false)
      // A restricted space starts with only you and the administrators: pick who else comes in.
      router.push(
        `/know/spaces/${result.data.id}${restricted ? "?share=1" : ""}`
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? getErrorMessage(err) : t("failed"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="space-name">{t("name")}</FieldLabel>
              <div className="flex items-center gap-2">
                <EntityIconPicker
                  current={{
                    iconType: icon.iconType,
                    icon: icon.icon,
                    emoji: icon.emoji,
                  }}
                  onChange={setIcon}
                  onRemove={() => setIcon(DEFAULT_ICON)}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("chooseIcon")}
                  >
                    <EntityGlyph
                      iconType={icon.iconType}
                      icon={icon.icon}
                      emoji={icon.emoji}
                      fallback="book-open"
                    />
                  </Button>
                </EntityIconPicker>
                <Input
                  id="space-name"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  autoFocus
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="space-visibility">
                {t("visibility")}
              </FieldLabel>
              <Select
                value={restricted ? "restricted" : "open"}
                onValueChange={(value) => setRestricted(value === "restricted")}
              >
                <SelectTrigger
                  id="space-visibility"
                  className="w-full"
                  disabled={openLocked}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <GlobeIcon />
                    {t("open")}
                  </SelectItem>
                  <SelectItem value="restricted">
                    <LockIcon />
                    {t("restricted")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {openLocked
                  ? t("openLocked")
                  : restricted
                    ? t("restrictedHint")
                    : t("openHint")}
              </FieldDescription>
              {isolated && !restricted && (
                <FieldDescription>
                  {t("visibleToEveryMainNode")}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
