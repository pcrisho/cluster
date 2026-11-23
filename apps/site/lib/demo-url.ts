/**
 * Resolves the demo URL from environment or input.
 * Accepts only mailto: and https: protocols, returning null otherwise.
 */
export function parseDemoUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("mailto:")) {
    const recipient = trimmed.slice(7)
    if (recipient.length > 0 && !/\s/.test(recipient)) {
      return trimmed
    }
    return null
  }

  if (trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === "https:") {
        return parsed.toString()
      }
    } catch {
      return null
    }
  }

  return null
}

export function getDemoUrl(): string | null {
  return parseDemoUrl(process.env.NEXT_PUBLIC_DEMO_URL)
}
