/** Accepts only `https:` URLs (stripping trailing slashes); returns `null` otherwise. */
export function parseHttpsUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    return url.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

export function getDocsUrl(): string | null {
  return parseHttpsUrl(process.env.NEXT_PUBLIC_DOCS_URL)
}
