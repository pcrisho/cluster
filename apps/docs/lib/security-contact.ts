/**
 * Parses `NEXT_PUBLIC_SECURITY_CONTACT` at build time.
 * Accepts only `mailto:` or `https:` URIs; returns `null` for any other value.
 */
export function parseSecurityContact(raw: string | undefined): {
  href: string
  kind: "mailto" | "https"
  display: string
} | null {
  const value = raw?.trim()
  if (!value) return null
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) {
    return { href: value, kind: "mailto", display: value.slice("mailto:".length) }
  }
  try {
    const url = new URL(value)
    if (url.protocol === "https:") {
      return { href: url.toString(), kind: "https", display: url.toString() }
    }
  } catch {
    // Invalid URL
  }
  return null
}

let warnedMissing = false

export function getSecurityContact(): ReturnType<typeof parseSecurityContact> {
  const parsed = parseSecurityContact(process.env.NEXT_PUBLIC_SECURITY_CONTACT)
  if (!parsed && !warnedMissing && process.env.NODE_ENV !== "test") {
    warnedMissing = true
    console.warn("docs: NEXT_PUBLIC_SECURITY_CONTACT is not set; security policy page will show no contact")
  }
  return parsed
}
