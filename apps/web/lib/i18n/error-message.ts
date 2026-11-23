/** What the web knows about a failed request (lib/api.ts ApiError). */
export type ErrorInfo = {
  code: string
  status: number
  /** The API's English message. */
  message: string
  params?: Record<string, string | number>
}

/** The `errors` namespace of the catalog. */
export type ErrorCatalog = {
  has: (key: string) => boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * The message a person sees for a failed request: the translation of its code; in English the
 * API's own message when the catalog has no text for the code; otherwise the status's message.
 */
export function errorMessage(
  error: ErrorInfo,
  catalog: ErrorCatalog,
  locale: string
): string {
  if (catalog.has(`codes.${error.code}`))
    return catalog.t(`codes.${error.code}`, error.params)
  if (locale === "en" && error.message) return error.message
  if (catalog.has(`status.${error.status}`))
    return catalog.t(`status.${error.status}`)
  return catalog.t(error.status >= 500 ? "status.500" : "generic")
}

let current: { catalog: ErrorCatalog; locale: string } | null = null

/** Set by <ErrorMessages /> inside the intl provider, so plain functions such as getErrorMessage can translate. */
export function setErrorCatalog(catalog: ErrorCatalog, locale: string) {
  current = { catalog, locale }
}

export function translateError(error: ErrorInfo): string {
  return current
    ? errorMessage(error, current.catalog, current.locale)
    : error.message
}

/** "Failed to fetch" and its kin: the request never reached the API. */
export function networkErrorMessage(): string {
  return (
    current?.catalog.t("network") ??
    "Can't reach the server. Check your connection and try again."
  )
}
