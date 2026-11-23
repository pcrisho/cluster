import { api } from "./api"
import { compressForKnow } from "./compress-image"

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"

/**
 * Browser URL for a stored image. Accepts a storage key
 * ("organizations/<org>/…"), a legacy direct-storage URL, or any other URL
 * (returned as is). Files are served by the API with the httpOnly file cookie.
 */
export function getImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith("organizations/")) return `${API_BASE}/files/${value}`
  // shortcut: legacy rows stored direct storage URLs (…/cluster/organizations/…); remove once migrated.
  const legacy = value.indexOf("/cluster/organizations/")
  if (legacy !== -1) {
    return `${API_BASE}/files/${value.slice(legacy + "/cluster/".length)}`
  }
  return value
}

/** Uploads an image (avatar, post image) and returns the storage key to persist. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  const { key } = await api.upload<{ key: string; url: string }>(
    "/files/images",
    form
  )
  return key
}

/** Uploads an image going into a rich-text body (GROW lesson text): compressed first. */
export async function uploadBodyImage(file: File): Promise<string> {
  return uploadImage(await compressForKnow(file))
}
