"use client"

import { useState } from "react"
import { Building2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { adminApi, type Organization } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"
import { getImageUrl } from "@/lib/images"
import { ImageCropperDialog } from "./image-cropper-dialog"

/** The organization's logo, shown in the sidebar: pick, crop to a square (PNG keeps transparency), remove. Saves at once. */
export function OrganizationLogo({
  logoUrl,
  onUpdated,
}: {
  logoUrl: string | null
  onUpdated: (org: Organization) => Promise<void>
}) {
  const t = useTranslations("settings.organization.logo")
  const [picked, setPicked] = useState<File | null>(null)
  const [removing, setRemoving] = useState(false)

  async function remove() {
    setRemoving(true)
    try {
      await onUpdated(await adminApi.updateOrganization({ logoUrl: null }))
      toast.success(t("removed"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16 rounded-xl after:rounded-xl">
        <AvatarImage
          src={getImageUrl(logoUrl) ?? undefined}
          alt=""
          className="rounded-xl bg-card object-contain"
        />
        <AvatarFallback className="rounded-xl">
          <Building2Icon className="size-6" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              {logoUrl ? t("change") : t("upload")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setPicked(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
              />
            </label>
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={removing}
            >
              {t("remove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <ImageCropperDialog
        open={picked !== null}
        file={picked}
        onClose={() => setPicked(null)}
        onSave={async (key) =>
          onUpdated(await adminApi.updateOrganization({ logoUrl: key }))
        }
        shape="rect"
        output={{ size: 256, type: "image/png" }}
        labels={{
          title: t("cropTitle"),
          description: t("cropDescription"),
          updated: t("updated"),
          failed: t("failed"),
        }}
      />
    </div>
  )
}
