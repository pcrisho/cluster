import { typesOfKind } from "@cluster/editor-schema"

/**
 * Public base URL of the API as the browser sees it. Same variable the web
 * build uses, so both sides always agree.
 */
export function publicApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"
  ).replace(/\/$/, "")
}

/** Browser URL for a stored object; served by FilesController with permission checks. */
export function fileUrl(key: string): string {
  return `${publicApiUrl()}/files/${key.split("/").map(encodeURIComponent).join("/")}`
}

/** Every stored object lives under its organization's prefix. */
export function orgKeyPrefix(orgId: string): string {
  return `organizations/${orgId}/`
}

const UPLOAD_NAME = new RegExp(
  `^[\\w-]+\\.(${typesOfKind("image")
    .map((t) => t.extensions[0])
    .join("|")})$`,
)

/** Keys written by POST /files/images for this organization. Image lists sent by clients are untrusted. */
export function isOwnUploadKey(orgId: string, key: string): boolean {
  const prefix = `${orgKeyPrefix(orgId)}uploads/`
  return key.startsWith(prefix) && UPLOAD_NAME.test(key.slice(prefix.length))
}
